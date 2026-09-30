import Link from "next/link";
import { AlertTriangle, ArrowRight, CheckCircle2, CircleDot, Clock, Compass } from "lucide-react";
import type { Guide, GuideAction } from "@/lib/season-guide";
import { Badge, Card } from "@/components/ui";
import { archiveSeason, createNextSeasonAction, finishSeason, runSync, swapSuggestedTeams } from "@/app/actions/admin";
import { ActionButton } from "./ui";

const ICON = { done: CheckCircle2, now: CircleDot, todo: Clock, warn: AlertTriangle };
const TONE = { done: "text-pitch", now: "text-gold", todo: "text-muted", warn: "text-danger" };
const LABEL = { done: "Klart", now: "Gör nu", todo: "Senare", warn: "Behöver åtgärd" };

function StepAction({ action, seasonId }: { action: GuideAction; seasonId: string }) {
  switch (action.kind) {
    case "finish":
      return (
        <ActionButton action={finishSeason.bind(null, seasonId, true, false)} variant="gold" confirm="Avsluta säsongen? Slutställningen fastställs och alla får en notis med vinnarna.">
          Avsluta säsongen
        </ActionButton>
      );
    case "finishForce":
      return (
        <ActionButton action={finishSeason.bind(null, seasonId, true, true)} variant="outline" confirm="Avsluta trots att alla matcher inte är spelade? Gör bara det om du har kontrollerat slutställningen.">
          Avsluta ändå
        </ActionButton>
      );
    case "archive":
      return (
        <ActionButton action={archiveSeason.bind(null, seasonId)} variant="gold">
          Arkivera resultaten
        </ActionButton>
      );
    case "createNext":
      return (
        <ActionButton action={createNextSeasonAction} variant="gold" confirm="Skapa nästa års tävling? Den blir aktiv direkt. Du kan ändra datum och lag efteråt.">
          Skapa nästa års tävling
        </ActionButton>
      );
    case "syncSquads":
      return <ActionButton action={runSync.bind(null, "squads")}>Hämta trupper nu</ActionButton>;
    case "swapTeams":
      return (
        <ActionButton action={swapSuggestedTeams.bind(null, action.out, action.in)} variant="gold" confirm="Byt lagen enligt förslaget?">
          Byt lagen
        </ActionButton>
      );
    case "link":
      return (
        <Link href={action.href} className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-border-strong px-4 text-sm font-semibold hover:border-pitch">
          {action.label} <ArrowRight className="size-4" />
        </Link>
      );
  }
}

/** Säsongsguiden: det som gäller just nu, i ordning, med en knapp per steg. Stegen bockas av automatiskt. */
export function SeasonGuide({ guide, seasonId }: { guide: Guide; seasonId: string }) {
  const done = guide.steps.filter((s) => s.state === "done").length;
  const needs = guide.steps.filter((s) => s.state === "warn" || s.state === "now").length;
  const calm = !needs;
  return (
    <Card className={calm ? "" : "border-gold/50"}>
      <div className="flex flex-wrap items-center gap-2">
        <Compass className="size-6 text-gold" aria-hidden />
        <h3 className="font-display text-3xl">Säsongsguide</h3>
        <Badge tone={calm ? "pitch" : "gold"}>{calm ? "Inget att göra" : `${needs} att göra`}</Badge>
      </div>
      <p className="mt-2 font-semibold">{guide.title}</p>
      <p className="text-sm text-muted">{guide.summary}</p>
      {guide.steps.length > 1 && (
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-3" role="progressbar" aria-valuemin={0} aria-valuemax={guide.steps.length} aria-valuenow={done} aria-label="Klara steg">
          <div className="h-full rounded-full bg-pitch transition-[width]" style={{ width: `${(done / guide.steps.length) * 100}%` }} />
        </div>
      )}
      {guide.steps.length > 0 && (
        <ol className="mt-4 space-y-3">
          {guide.steps.map((s) => {
            const I = ICON[s.state];
            return (
              <li key={s.id} className={`flex flex-wrap items-start gap-3 rounded-xl p-3 ${s.state === "now" || s.state === "warn" ? "bg-surface-2" : ""}`}>
                <I className={`mt-0.5 size-5 shrink-0 ${TONE[s.state]}`} aria-label={LABEL[s.state]} />
                <div className="min-w-0 flex-1 text-sm">
                  <p className={`font-semibold ${s.state === "done" || s.state === "todo" ? "text-muted" : ""}`}>{s.title}</p>
                  {s.detail && s.state !== "done" && <p className="mt-0.5 text-muted">{s.detail}</p>}
                </div>
                {s.action && s.state !== "done" && s.state !== "todo" && (
                  <div className="w-full pl-8 sm:w-auto sm:pl-0">
                    <StepAction action={s.action} seasonId={seasonId} />
                  </div>
                )}
                {s.action && s.state === "todo" && s.action.kind === "link" && (
                  <div className="w-full pl-8 sm:w-auto sm:pl-0">
                    <StepAction action={s.action} seasonId={seasonId} />
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </Card>
  );
}
