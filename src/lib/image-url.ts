/**
 * Ber bildkällan om en lagom stor variant i stället för originalet.
 * ESPN:s loggor är 500×500 px (15–40 kB) men visas på 20–40 px – combiner-tjänsten skalar dem på deras CDN.
 * Storleken avrundas uppåt till några få steg, så att samma fil återanvänds ur webbläsarens cache.
 */
const STEPS = [48, 96, 192];

export function sizedImage(url: string, cssPx: number): string {
  const px = STEPS.find((s) => s >= cssPx * 2) ?? 500;
  const espn = /^https:\/\/a\.espncdn\.com(\/i\/teamlogos\/[^?#]+\.png)$/.exec(url);
  if (espn && px < 500) return `https://a.espncdn.com/combiner/i?img=${espn[1]}&w=${px}&h=${px}`;
  // TheSportsDB: /small = 250 px, /tiny = 50 px (dokumenterade varianter)
  if (/^https:\/\/(www\.)?thesportsdb\.com\/images\/.+\.(png|jpe?g)$/i.test(url)) return px <= 50 ? `${url}/tiny` : px <= 250 ? `${url}/small` : url;
  return url;
}
