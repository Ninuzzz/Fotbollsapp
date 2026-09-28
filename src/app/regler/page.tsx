import { getActiveSeason, computePrizes } from "@/lib/season";
import { parseSplit } from "@/lib/prizes";
import { PageHeader, Card } from "@/components/ui";
import { Reveal } from "@/components/motion";
import { fmtDateTime, kr } from "@/lib/format";

export const metadata = { title: "Regler & priser" };
export const dynamic = "force-dynamic";

export default async function RulesPage() {
  const season = await getActiveSeason();
  if (!season) return null;
  const { pool, participants } = await computePrizes(season.id);
  const split = parseSplit(season.prizeSplit);
  return (
    <div className="mx-auto max-w-3xl px-4 py-8 md:py-12">
      <PageHeader kicker={season.name} title="Regler & priser" />
      <div className="space-y-6">
        <Reveal>
          <Card>
            <h2 className="font-display text-3xl">Så går det till</h2>
            <ul className="mt-3 list-disc space-y-2 pl-5 text-muted">
              <li>Tippa hur Allsvenskan slutar, plats 1–16. Alla lag måste vara med exakt en gång.</li>
              <li>Tippar du Malmö FF som etta och de blir trea får du <strong className="text-text">två fel</strong> på det laget.</li>
              <li>Felen för alla 16 lag läggs ihop. <strong className="text-text">Minst antal fel vinner.</strong></li>
              <li>Tipset kan ändras fritt fram till {fmtDateTime(season.editDeadline)}. Sista anmälningsdag är {fmtDateTime(season.registrationDeadline)}.</li>
              <li>Slutresultatet betyder allt. Man får inget extra för att ha legat i ledningen under säsongen.</li>
            </ul>
          </Card>
        </Reveal>
        <Reveal>
          <Card>
            <h2 className="font-display text-3xl">Vid lika poäng</h2>
            <ol className="mt-3 list-decimal space-y-2 pl-5 text-muted">
              <li>Flest mål av din tippade skytteligavinnare (närmast den verkliga vinnaren).</li>
              <li>Flest assist av din tippade assistligavinnare.</li>
              <li>Flest lag på exakt rätt placering.</li>
              <li>Går det ändå inte att skilja er åt delar ni placeringen.</li>
            </ol>
            <p className="mt-3 text-sm text-gold">Ta ditt val av skytteligavinnare på yttersta allvar! 2016 avgjorde det plats 2–4.</p>
          </Card>
        </Reveal>
        <Reveal>
          <Card>
            <h2 className="font-display text-3xl">Priser</h2>
            <p className="mt-3 text-muted">
              Insatsen är {kr(season.entryFee)} (Swish till {season.swishNumber}). {kr(season.reservedAmount)} avsätts till mugg, vandringspris och tröstpris:
              sistaplatsen får gratis medverkan året därpå. Resten av potten fördelas:
            </p>
            <div className="mt-4 grid grid-cols-3 gap-3 text-center">
              {split.map((pct, i) => (
                <div key={i} className="rounded-xl bg-bg/50 p-3">
                  <p className="font-display text-4xl text-gold">{i + 1}:a</p>
                  <p className="font-semibold">{pct} %</p>
                  <p className="text-sm text-muted">{kr(Math.floor((pool * pct) / 100))} just nu</p>
                </div>
              ))}
            </div>
            <p className="mt-3 text-sm text-muted">
              Just nu: {participants} betalande × {kr(season.entryFee)} − {kr(season.reservedAmount)} = <strong className="text-text">{kr(pool)}</strong>.
              Vinnaren får även en mugg och sitt namn på vandringspriset.
            </p>
            <h3 className="mt-5 font-semibold">Finstilt vid delade placeringar</h3>
            <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm text-muted">
              <li>Tre eller fler delar förstaplatsen: de delar lika på hela potten.</li>
              <li>Två delar förstaplatsen: de delar på 1:ans och 2:ans del, och 3:an får sin del.</li>
              <li>Två eller fler delar andraplatsen: de delar på 2:ans och 3:ans del.</li>
              <li>Två eller fler delar tredjeplatsen: de delar på 3:ans del.</li>
            </ul>
          </Card>
        </Reveal>
        <Reveal>
          <Card>
            <h2 className="font-display text-3xl">Under säsongen</h2>
            <p className="mt-3 text-muted">
              Tabellen uppdateras automatiskt efter varje omgång. Vid varje uppdatering koras <strong className="text-text">veckans raket</strong> (flest
              placeringar uppåt), <strong className="text-text">veckans djupdykning</strong> (flest nedåt) och <strong className="text-text">veckans jojo</strong> (mest
              upp och ner de senaste omgångarna).
            </p>
          </Card>
        </Reveal>
      </div>
    </div>
  );
}
