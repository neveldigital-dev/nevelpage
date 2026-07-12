// Edge Function — proxy pra checar se um número está no WhatsApp via Evolution API.
// Nunca expõe a apikey ao browser. Espera POST { phone: "11987654321" } (11 dígitos, DDD + celular).
// Retorna { exists: true|false }. Em caso de erro/timeout, devolve { exists: null, error: '...' }
// e o front decide se libera o envio (fallback aberto) ou trava.
export const config = { runtime: 'edge' };

const TIMEOUT_MS = 4000;

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json',
      'cache-control': 'no-store',
    },
  });
}

export default async function handler(req) {
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  let body;
  try { body = await req.json(); } catch { return json({ error: 'invalid json' }, 400); }

  const raw = String(body?.phone || '').replace(/\D/g, '');
  if (raw.length !== 11) return json({ error: 'phone must have 11 digits' }, 400);

  const base = process.env.EVOLUTION_API_URL;
  const instance = process.env.EVOLUTION_INSTANCE;
  const apikey = process.env.EVOLUTION_API_KEY;
  if (!base || !instance || !apikey) return json({ exists: null, error: 'not configured' }, 500);

  // E.164 sem "+" (Evolution espera 55 + DDD + celular)
  const e164 = '55' + raw;

  const url = `${base.replace(/\/$/, '')}/chat/whatsappNumbers/${encodeURIComponent(instance)}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', apikey },
      body: JSON.stringify({ numbers: [e164] }),
      signal: ctrl.signal,
    });
    clearTimeout(timer);

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.error('evolution api http', res.status, text);
      return json({ exists: null, error: 'evolution api ' + res.status }, 502);
    }

    const data = await res.json();
    const first = Array.isArray(data) ? data[0] : data;
    const exists = Boolean(
      first && (first.exists === true || first.numberExists === true || (first.jid && first.jid.includes('@s.whatsapp.net')))
    );
    return json({ exists });
  } catch (err) {
    clearTimeout(timer);
    console.error('check-whatsapp fetch failed', err?.message || err);
    return json({ exists: null, error: 'network' }, 502);
  }
}
