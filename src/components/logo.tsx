/** Varumärke: en guldsköld med en boll – "tipset" som vandringspris. */
export function Logo({ size = 36 }: { size?: number }) {
  return (
    <svg viewBox="0 0 48 54" width={size} height={size * 1.12} role="img" aria-label="Allsvenskantipset">
      <defs>
        <linearGradient id="lg-gold" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#fff1a8" />
          <stop offset=".5" stopColor="#f5c518" />
          <stop offset="1" stopColor="#a67c00" />
        </linearGradient>
      </defs>
      <path d="M24 2 L45 9 L45 26 C45 40 35 48 24 52 C13 48 3 40 3 26 L3 9 Z" fill="url(#lg-gold)" />
      <path d="M24 6 L41 12 L41 26 C41 37 33 44 24 47.5 C15 44 7 37 7 26 L7 12 Z" fill="#07140d" />
      <circle cx="24" cy="26" r="11" fill="#f8fafc" />
      <path d="M24 19.5 L30 24 L27.8 31 L20.2 31 L18 24 Z" fill="#07140d" />
      <path d="M24 19.5 V15 M30 24 L34.5 22.5 M27.8 31 L30.5 35 M20.2 31 L17.5 35 M18 24 L13.5 22.5" stroke="#07140d" strokeWidth="1.4" />
    </svg>
  );
}
