const PUBLIC_PAGES = ['/', '/agents/', '/delegate/', '/earn/', '/how/', '/board/', '/numbers/', '/privacy/', '/terms/'];

export function sitemapResponse(): Response {
  const urls = PUBLIC_PAGES.map(path => `<url><loc>https://omakasebox.dev${path}</loc></url>`).join('\n');
  return new Response(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`, {
    headers: { 'content-type': 'application/xml; charset=utf-8', 'cache-control': 'public, max-age=3600' }
  });
}
