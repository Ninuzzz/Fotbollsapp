import { parseAvatar } from "./avatar";

/**
 * Integritet som standard: besökare som inte är inloggade ser bara initialer
 * och en neutral tröja – aldrig fullständiga namn eller uppladdade bilder.
 */
export function publicName(name: string, loggedIn: boolean) {
  if (loggedIn) return name;
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .map((p) => p[0]!.toUpperCase() + ".")
      .join(" ") || "Tippare"
  );
}

export function publicAvatar(avatar: string, loggedIn: boolean) {
  if (loggedIn) return avatar;
  return parseAvatar(avatar).kind === "image" ? "jersey:solid:#1f3a2d:#9bb3a6:0" : avatar;
}

export function publicUser<T extends { name: string; avatar: string }>(u: T, loggedIn: boolean): T {
  return { ...u, name: publicName(u.name, loggedIn), avatar: publicAvatar(u.avatar, loggedIn) };
}
