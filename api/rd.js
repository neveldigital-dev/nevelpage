// Edge Function — split-test redirect 33/33/34
// Roda no edge da Vercel e devolve 307 direto pro destino sorteado.
// Sem HTML, sem JS no cliente — zero overhead de parse.
export const config = { runtime: 'edge' };

const VARIANTS = [
  { url: 'https://med.neveldigital.com.br/',   weight: 33 },
  { url: 'https://med.neveldigital.com.br/v2', weight: 33 },
  { url: 'https://neveldigital.com.br/',       weight: 34 },
];

export default function handler(request) {
  // Sorteio cumulativo pelos pesos
  const roll = Math.random() * 100;
  let acc = 0;
  let chosen = VARIANTS[VARIANTS.length - 1].url;
  for (let i = 0; i < VARIANTS.length; i++) {
    acc += VARIANTS[i].weight;
    if (roll < acc) { chosen = VARIANTS[i].url; break; }
  }

  // Preserva query string (UTMs etc.) do request original
  const incoming = new URL(request.url);
  const dest = new URL(chosen);
  incoming.searchParams.forEach((v, k) => dest.searchParams.set(k, v));

  // 307 = Temporary Redirect (preserva método). no-store evita qualquer
  // cache em edge/browser — cada visita sorteia de novo.
  return new Response(null, {
    status: 307,
    headers: {
      'Location': dest.toString(),
      'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
      'CDN-Cache-Control': 'no-store',
      'Vercel-CDN-Cache-Control': 'no-store',
    },
  });
}
