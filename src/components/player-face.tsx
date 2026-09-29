import { onColor } from "@/lib/avatar";
import { sizedImage } from "@/lib/image-url";

/** Spelarfoto från API, annars initialer i lagets färger */
export function PlayerFace({
  name,
  photoUrl,
  team,
  size = 64,
  className = "",
}: {
  name: string;
  photoUrl?: string | null;
  team: { primaryColor: string; secondaryColor: string };
  size?: number;
  className?: string;
}) {
  if (photoUrl)
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={sizedImage(photoUrl, size)}
        alt={name}
        width={size}
        height={size}
        loading="lazy"
        decoding="async"
        className={`shrink-0 rounded-full bg-surface-3 object-cover object-top ${className}`}
        style={{ width: size, height: size }}
      />
    );
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <div
      aria-label={name}
      role="img"
      className={`font-display grid shrink-0 place-items-center rounded-full ${className}`}
      style={{
        width: size,
        height: size,
        fontSize: size * 0.4,
        background: `linear-gradient(135deg, ${team.primaryColor}, color-mix(in oklab, ${team.primaryColor} 55%, black))`,
        color: onColor(team.primaryColor),
        boxShadow: `inset 0 0 0 3px ${team.secondaryColor}55`,
      }}
    >
      {initials}
    </div>
  );
}
