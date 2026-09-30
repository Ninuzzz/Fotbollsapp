/**
 * Säsongsguiden i admin: visar bara det som gäller just nu, i rätt ordning, med en knapp i varje steg.
 * Stegen bockas av automatiskt utifrån datan – de går inte att kryssa i för hand, så guiden kan aldrig påstå
 * att något är klart som inte är det.
 *
 * `buildSeasonGuide` är en ren funktion (testas i season-guide.test.ts); `loadSeasonGuide` hämtar läget.
 */
import type { EspnLeagueTeam } from "./espn";
import type { TeamCheck } from "./season-admin";

export type GuideAction =
  | { kind: "finish" }
  | { kind: "finishForce" }
  | { kind: "archive" }
  | { kind: "createNext" }
  | { kind: "syncSquads" }
  | { kind: "swapTeams"; out: string[]; in: string[] }
  | { kind: "link"; href: string; label: string };

export type GuideStep = { id: string; state: "done" | "now" | "todo" | "warn"; title: string; detail?: string; action?: GuideAction };
export type Guide = { mode: "running" | "waiting" | "finish" | "prepare"; title: string; summary: string; steps: GuideStep[] };

export type GuideState = {
  now: Date;
  season: { name: string; year: number; isFinished: boolean; totalRounds: number; startDate: Date; registrationDeadline: Date; editDeadline: Date };
  phase: "TIPPING" | "RUNNING" | "FINISHED";
  round: number;
  finish: { hasTable: boolean; ready: boolean; behind: { name: string; played: number }[] };
  archived: number;
  hero: { consent: boolean } | null;
  previousHeroWithoutConsent: number | null;
  nextSeasonExists: boolean;
  teamsCount: number;
  teams: TeamCheck;
  playerCount: number;
  entries: { total: number; confirmed: number; claimed: number; incomplete: number };
  bottom: { relegated: string[]; playoff: string | null } | null;
};

const fmt = (d: Date) => d.toLocaleString("sv-SE", { timeZone: "Europe/Stockholm", dateStyle: "long", timeStyle: "short" });
const days = (to: Date, now: Date) => Math.ceil((to.getTime() - now.getTime()) / 864e5);

export function buildSeasonGuide(s: GuideState): Guide {
  const y = s.season.year;
  const paymentsStep = (): GuideStep | null =>
    s.entries.claimed
      ? {
          id: "payments",
          state: "now",
          title: `Bekräfta ${s.entries.claimed} Swish-betalning${s.entries.claimed > 1 ? "ar" : ""}`,
          detail: "Jämför med Swish i telefonen och tryck Bekräfta betalning.",
          action: { kind: "link", href: "/admin/deltagare?filter=claimed", label: "Till deltagarna" },
        }
      : null;

  // ── Säsongen är slut (eller sista matchen spelad): avsluta, arkivera, vinnare, nästa år
  if (s.phase === "FINISHED" || s.finish.ready || (s.round >= s.season.totalRounds && s.finish.hasTable)) {
    const finished = s.phase === "FINISHED";
    const steps: GuideStep[] = [
      finished
        ? { id: "finish", state: "done", title: "Säsongen är avslutad", detail: "Slutställningen är fastställd och alla har fått veta vem som vann." }
        : s.finish.ready
          ? { id: "finish", state: "now", title: "Avsluta säsongen", detail: "Alla lag har spelat klart. Tabellen fryses och alla får en notis med vinnarna och prispengarna.", action: { kind: "finish" } }
          : {
              id: "finish",
              state: "warn",
              title: "Väntar på de sista matcherna",
              detail: `${s.finish.behind.map((b) => `${b.name} (${b.played})`).join(", ")} har inte spelat alla ${s.season.totalRounds} matcher. Har du kontrollerat slutställningen på allsvenskan.se kan du avsluta ändå.`,
              action: { kind: "finishForce" },
            },
      {
        id: "archive",
        state: s.archived > 0 ? "done" : finished ? "now" : "todo",
        title: s.archived > 0 ? `Resultaten är arkiverade (${s.archived} tippare)` : "Arkivera resultaten",
        detail: s.archived > 0 ? undefined : "Sparar allas placering och fel till Heroes-sidans all-time-statistik.",
        action: s.archived > 0 || !finished ? undefined : { kind: "archive" },
      },
      {
        id: "hero",
        state: s.hero ? (s.hero.consent ? "done" : "warn") : finished ? "now" : "todo",
        title: s.hero ? (s.hero.consent ? `Årets vinnare finns i Hall of Fame` : "Årets vinnare saknar samtycke") : `Lägg in ${y} års vinnare i Hall of Fame`,
        detail: s.hero && !s.hero.consent ? "Namn och bild visas först när vinnaren har sagt ja. Bocka i samtycke när du har frågat." : s.hero ? undefined : "Namn, bild och en rad om säsongen.",
        action: s.hero?.consent ? undefined : { kind: "link", href: "/admin/heroes", label: "Till Heroes" },
      },
      {
        id: "next",
        state: s.nextSeasonExists ? "done" : finished ? "now" : "todo",
        title: s.nextSeasonExists ? `Tävlingen för ${y + 1} är skapad` : `Skapa tävlingen för ${y + 1}`,
        detail: s.nextSeasonExists
          ? undefined
          : `Datum flyttas ett år fram, avgift, Swish och lag kopieras. Den blir aktiv direkt och trupperna hämtas. Du kontrollerar datumen och byter lagen i nästa steg.${
              s.bottom ? ` Åker ur: ${s.bottom.relegated.join(" och ")}${s.bottom.playoff ? `, kval: ${s.bottom.playoff}` : ""}.` : ""
            }`,
        action: s.nextSeasonExists || !finished ? undefined : { kind: "createNext" },
      },
    ];
    const done = steps.filter((x) => x.state === "done").length;
    return {
      mode: "finish",
      title: finished ? `${s.season.name} är klar – dags för nästa år` : `Sista omgången är spelad`,
      summary: `${done} av ${steps.length} klara.`,
      steps,
    };
  }

  // ── Inför säsongen: tippning pågår
  if (s.phase === "TIPPING") {
    const toDeadline = days(s.season.editDeadline, s.now);
    const teamsStep: GuideStep =
      s.teamsCount !== 16
        ? { id: "teams", state: "warn", title: `Tävlingen har ${s.teamsCount} lag – ska vara 16`, action: { kind: "link", href: "/admin/lag", label: "Till lagen" } }
        : s.teams.status === "ok"
          ? { id: "teams", state: "done", title: "Lagen stämmer med ESPN:s laglista" }
          : s.teams.status === "diff"
            ? {
                id: "teams",
                state: "warn",
                title: "Byt lagen som åkt upp och ner",
                detail: `Ut: ${s.teams.out.map((t) => t.name).join(", ") || "–"}. In: ${s.teams.in.map((t) => t.name).join(", ") || "–"} (enligt ESPN). Nya lag skapas med namn, färger och logotyp.`,
                action: s.teams.out.length === s.teams.in.length ? { kind: "swapTeams", out: s.teams.out.map((t) => t.id), in: s.teams.in.map((t: EspnLeagueTeam) => String(t.espnId)) } : { kind: "link", href: "/admin/lag", label: "Till lagen" },
              }
            : s.teams.status === "stale"
              ? {
                  id: "teams",
                  state: "warn",
                  title: "Byt lagen som åkt upp och ner",
                  detail: "ESPN visar ännu förra årets lag, så inget förslag kan ges än. Byt själv under Lag, eller kolla igen om några veckor.",
                  action: { kind: "link", href: "/admin/lag", label: "Till lagen" },
                }
              : { id: "teams", state: "warn", title: "Kontrollera att rätt 16 lag är med", detail: s.teams.reason, action: { kind: "link", href: "/admin/lag", label: "Till lagen" } };
    const steps: GuideStep[] = [
      {
        id: "dates",
        state: "todo",
        title: "Kontrollera datum, avgift och Swish",
        detail: `Seriestart ${fmt(s.season.startDate)}, sista anmälan ${fmt(s.season.registrationDeadline)}, sista tippdag ${fmt(s.season.editDeadline)}. Stäm av mot allsvenskan.se.`,
        action: { kind: "link", href: "/admin/tavlingar", label: "Ändra" },
      },
      teamsStep,
      s.playerCount >= 30
        ? { id: "players", state: "done", title: `${s.playerCount} spelare att välja som skytt och assistkung` }
        : { id: "players", state: "warn", title: `Bara ${s.playerCount} spelare – tipparna behöver kunna välja skytt och assistkung`, detail: "Hämtas automatiskt en gång per dygn.", action: { kind: "syncSquads" } },
      ...(s.previousHeroWithoutConsent
        ? [{ id: "consent", state: "warn" as const, title: `${s.previousHeroWithoutConsent} års vinnare syns inte i Hall of Fame`, detail: "Samtycke saknas. Fråga vinnaren och bocka i.", action: { kind: "link" as const, href: "/admin/heroes", label: "Till Heroes" } }]
        : []),
      {
        id: "invite",
        state: s.entries.total > 0 ? "done" : "now",
        title: s.entries.total > 0 ? `${s.entries.total} har anmält sig` : "Bjud in gänget",
        detail: "Skicka länken /registrera i sms eller mejl, eller en nyhet med push till alla som var med förra året.",
        action: { kind: "link", href: "/admin/utskick", label: "Skriv utskick" },
      },
      ...[paymentsStep()].filter((x): x is GuideStep => Boolean(x)),
      {
        id: "tips",
        state: s.entries.incomplete ? "warn" : s.entries.confirmed ? "done" : "todo",
        title: s.entries.incomplete ? `${s.entries.incomplete} betalande har inte lämnat in ett komplett tips` : `Sista tippdag om ${toDeadline} dag${toDeadline === 1 ? "" : "ar"}`,
        detail: "Påminnelser går ut automatiskt 7, 3 och 1 dag före deadline. Tipsen låses automatiskt.",
      },
    ];
    const needs = steps.filter((x) => x.state === "warn" || x.state === "now").length;
    return {
      mode: "prepare",
      title: `Inför ${s.season.name}`,
      summary: needs ? `${needs} sak${needs > 1 ? "er" : ""} att göra före deadline ${fmt(s.season.editDeadline)}.` : "Allt är klart. Resten sker automatiskt.",
      steps,
    };
  }

  // ── Tipsen är låsta men serien har inte börjat
  const pay = paymentsStep();
  if (s.round === 0) {
    return {
      mode: "waiting",
      title: "Väntar på seriestart",
      summary: "Tipsen är låsta. Tabellen, tipstabellen och notiserna kommer igång av sig själva när första omgången är spelad.",
      steps: pay ? [pay] : [],
    };
  }

  // ── Säsongen pågår
  return {
    mode: "running",
    title: `Omgång ${s.round} av ${s.season.totalRounds}`,
    summary: pay
      ? "Allt annat sker automatiskt."
      : "Inget att göra – tabellen hämtas automatiskt, och alla får en notis per färdigspelad omgång. Du får ett meddelande när sista omgången är spelad.",
    steps: pay ? [pay] : [],
  };
}
