import { onColor, parseAvatar, type JerseyAvatar } from "@/lib/avatar";

/** Spelaravatar: en fotbollströja i valfria färger + nummer, eller uppladdad bild. */
export function Avatar({ value, name, size = 40, className = "" }: { value: string; name?: string; size?: number; className?: string }) {
  const a = parseAvatar(value);
  if (a.kind === "image")
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={a.src}
        alt={name ? `Avatar för ${name}` : ""}
        width={size}
        height={size}
        className={`rounded-full object-cover ring-2 ring-border-strong ${className}`}
        style={{ width: size, height: size }}
      />
    );
  return <Jersey {...a} size={size} className={className} label={name ? `Avatar för ${name}` : undefined} />;
}

export function Jersey({
  pattern,
  color1,
  color2,
  number,
  size = 40,
  className = "",
  label,
}: Omit<JerseyAvatar, "kind"> & { size?: number; className?: string; label?: string }) {
  const id = `j${pattern}${color1}${color2}`.replace(/[^a-z0-9]/gi, "");
  const text = pattern === "solid" || pattern === "sash" ? onColor(color1) : "#ffffff";
  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      className={`shrink-0 rounded-full bg-surface-3 ring-2 ring-border-strong ${className}`}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <defs>
        <clipPath id={`c${id}`}>
          <path d="M20 12 L27 9 Q32 13 37 9 L44 12 L55 21 L49 29 L45 26 L45 54 L19 54 L19 26 L15 29 L9 21 Z" />
        </clipPath>
      </defs>
      <g clipPath={`url(#c${id})`}>
        <rect width="64" height="64" fill={color1} />
        {pattern === "stripes" &&
          [20, 28, 36, 44].map((x) => <rect key={x} x={x} y="0" width="4" height="64" fill={color2} />)}
        {pattern === "hoops" && [22, 32, 42].map((y) => <rect key={y} x="0" y={y} width="64" height="5" fill={color2} />)}
        {pattern === "halves" && <rect x="32" y="0" width="32" height="64" fill={color2} />}
        {pattern === "sash" && <path d="M14 14 L24 10 L52 54 L40 58 Z" fill={color2} />}
      </g>
      <path
        d="M20 12 L27 9 Q32 13 37 9 L44 12 L55 21 L49 29 L45 26 L45 54 L19 54 L19 26 L15 29 L9 21 Z"
        fill="none"
        stroke="rgba(0,0,0,.35)"
        strokeWidth="1.5"
      />
      <text
        x="32"
        y="42"
        textAnchor="middle"
        fontFamily="var(--font-bebas), Impact, sans-serif"
        fontSize="17"
        fill={text}
        stroke={pattern === "stripes" || pattern === "hoops" || pattern === "halves" ? "rgba(0,0,0,.55)" : "none"}
        strokeWidth="2.5"
        paintOrder="stroke"
      >
        {number}
      </text>
    </svg>
  );
}
