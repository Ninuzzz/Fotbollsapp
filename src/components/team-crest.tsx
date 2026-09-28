import { onColor } from "@/lib/avatar";

type CrestTeam = { name: string; shortName: string; logoUrl?: string | null; primaryColor: string; secondaryColor: string };

/**
 * Officiell logotyp från API när den finns, annars ett genererat sköldemblem i lagets färger.
 */
export function TeamCrest({ team, size = 28, className = "" }: { team: CrestTeam; size?: number; className?: string }) {
  if (team.logoUrl)
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={team.logoUrl}
        alt={`${team.name} logotyp`}
        width={size}
        height={size}
        loading="lazy"
        className={`shrink-0 object-contain ${className}`}
        style={{ width: size, height: size }}
      />
    );
  const fg = onColor(team.primaryColor);
  const label = team.shortName.length > 3 ? team.shortName.slice(0, 4) : team.shortName;
  return (
    <svg viewBox="0 0 40 46" width={size} height={size * 1.15} className={`shrink-0 ${className}`} role="img" aria-label={`${team.name} emblem`}>
      <path d="M20 1 L38 7 L38 22 C38 34 29 41 20 45 C11 41 2 34 2 22 L2 7 Z" fill={team.primaryColor} stroke={team.secondaryColor} strokeWidth="2.5" />
      <path d="M20 5 L34 10 L34 22 C34 31 27 37 20 40 Z" fill={team.secondaryColor} opacity="0.18" />
      <text
        x="20"
        y="27"
        textAnchor="middle"
        fontFamily="var(--font-bebas), Impact, sans-serif"
        fontSize={label.length > 3 ? 11 : 14}
        fill={fg}
      >
        {label}
      </text>
    </svg>
  );
}
