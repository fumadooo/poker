// Bloqueia robôs, crawlers e geradores de prévia de link: o site só abre para quem tem a URL e usa um navegador.
const BOTS = /bot|crawl|spider|slurp|scrap|archiv|preview|facebookexternalhit|meta-externalagent|whatsapp|telegram|slack|discord|embedly|bing|yandex|baidu|duckduck|semrush|ahrefs|mj12|petal|bytespider|gptbot|chatgpt|claude|anthropic|perplexity|ccbot|cohere|google-extended|applebot|python|curl|wget|httpclient|okhttp|go-http|java\/|libwww|headless|phantom|axios|node-fetch|undici/i;
export const config = { matcher: "/:path*" };
export default function middleware(request) {
  const ua = request.headers.get("user-agent") || "";
  if (!ua || BOTS.test(ua) || !/mozilla\//i.test(ua)) {
    return new Response("Not Found", { status: 404, headers: { "X-Robots-Tag": "noindex, nofollow", "Cache-Control": "no-store", "Content-Type": "text/plain" } });
  }
}
