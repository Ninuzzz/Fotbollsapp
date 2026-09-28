export type JerseyAvatar = {
  kind: "jersey";
  pattern: "solid" | "stripes" | "hoops" | "halves" | "sash";
  color1: string;
  color2: string;
  number: string;
};
export type ImageAvatar = { kind: "image"; src: string };
export type AvatarSpec = JerseyAvatar | ImageAvatar;

export const JERSEY_PATTERNS: { id: JerseyAvatar["pattern"]; label: string }[] = [
  { id: "solid", label: "Enfärgad" },
  { id: "stripes", label: "Ränder" },
  { id: "hoops", label: "Tvärränder" },
  { id: "halves", label: "Halvor" },
  { id: "sash", label: "Diagonal" },
];

export function parseAvatar(value: string | null | undefined): AvatarSpec {
  if (value?.startsWith("data:image/") || value?.startsWith("/") || value?.startsWith("http")) return { kind: "image", src: value };
  const [, pattern = "solid", color1 = "#1d4ed8", color2 = "#facc15", number = "10"] = (value ?? "").split(":");
  return { kind: "jersey", pattern: pattern as JerseyAvatar["pattern"], color1, color2, number };
}

export function jerseyString(a: Omit<JerseyAvatar, "kind">) {
  return `jersey:${a.pattern}:${a.color1}:${a.color2}:${a.number}`;
}

/** Läsbar textfärg (svart/vit) på en bakgrund */
export function onColor(hex: string) {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
  const r = (n >> 16) & 255,
    g = (n >> 8) & 255,
    b = n & 255;
  return 0.299 * r + 0.587 * g + 0.114 * b > 150 ? "#0a0a0a" : "#ffffff";
}
