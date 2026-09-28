import Link from "next/link";
import { PageHeader, Card } from "@/components/ui";

export const metadata = { title: "Integritetspolicy" };

const CONTACT = process.env.NEXT_PUBLIC_CONTACT_EMAIL;

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-8 md:py-12">
      <PageHeader kicker="GDPR" title="Integritetspolicy">
        Så hanterar Allsvenskantipset dina personuppgifter. Senast uppdaterad 28 september 2026.
      </PageHeader>
      <div className="space-y-5 [&_h2]:font-display [&_h2]:text-3xl [&_li]:mt-1.5 [&_p]:mt-2 [&_p]:text-muted [&_ul]:mt-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:text-muted">
        <Card>
          <h2>Vem ansvarar?</h2>
          <p>
            Personuppgiftsansvarig är arrangören av tipset (Anders, admin).{" "}
            {CONTACT ? (
              <>
                Kontakt: <a className="text-gold underline" href={`mailto:${CONTACT}`}>{CONTACT}</a>.
              </>
            ) : (
              <>Kontakta Anders direkt om du har frågor.</>
            )}
          </p>
        </Card>
        <Card>
          <h2>Vilka uppgifter sparas?</h2>
          <ul>
            <li><strong className="text-text">Konto:</strong> namn, e-postadress och lösenord (lagras endast som en säker hash, aldrig i klartext).</li>
            <li><strong className="text-text">Profil:</strong> favoritlag och avatar (tröja eller bild du själv laddar upp).</li>
            <li><strong className="text-text">Deltagande:</strong> ditt tips, dina utslagsfrågor, betalstatus och – om någon annan swishat åt dig – det namn eller de initialer du angett. Vi sparar inga telefonnummer, kontonummer eller Swish-transaktioner.</li>
            <li><strong className="text-text">Aktivitet:</strong> chattmeddelanden, vilka tippare du följer, dina notisinställningar och lästa notiser.</li>
            <li><strong className="text-text">Push:</strong> en teknisk prenumerationsadress från din webbläsare om du aktiverar pushnotiser.</li>
            <li><strong className="text-text">Historik:</strong> slutplacering och antal fel per säsong, för all-time-statistiken.</li>
          </ul>
        </Card>
        <Card>
          <h2>Varför och med vilken rätt?</h2>
          <p>
            Uppgifterna behövs för att du ska kunna delta i tipset (avtal) och för att visa tipstabell, chatt och statistik för gänget (ditt samtycke,
            som du lämnar vid registreringen). Vi använder inga spårningscookies och ingen reklam. Den enda cookien är en nödvändig inloggningscookie.
          </p>
        </Card>
        <Card>
          <h2>Vem ser vad?</h2>
          <ul>
            <li>Inloggade deltagare ser namn, avatar och placering i tipstabellen. Allas tips visas först efter deadline.</li>
            <li>Besökare som inte är inloggade ser bara initialer och standardavatarer – aldrig fullständiga namn eller uppladdade bilder.</li>
            <li>Chatten syns bara för betalande deltagare.</li>
            <li>Hall of Fame (Heroes) visar namn och bild på tidigare vinnare <strong className="text-text">endast om vinnaren gett sitt samtycke</strong>.</li>
            <li>Admin ser e-post och betalstatus för att kunna bekräfta betalningar.</li>
          </ul>
        </Card>
        <Card>
          <h2>Tredje parter</h2>
          <p>
            Tabeller, logotyper och spelarbilder hämtas från ESPN och TheSportsDB. Bilderna laddas i din webbläsare, vilket innebär att de tjänsterna ser din
            IP-adress. Pushnotiser levereras via din webbläsares pushtjänst (t.ex. Google, Apple eller Mozilla). Sajten drivs hos en hostingleverantör inom
            EU/EES. Inga uppgifter säljs eller delas i övrigt.
          </p>
        </Card>
        <Card>
          <h2>Hur länge?</h2>
          <p>
            Så länge ditt konto finns. Raderar du kontot tas all identifierbar data bort direkt: konto, tips, deltaganden, chattmeddelanden, följningar,
            pushprenumerationer och din historik. Ett eventuellt Hall of Fame-inlägg döljs.
          </p>
        </Card>
        <Card>
          <h2>Dina rättigheter</h2>
          <ul>
            <li><strong className="text-text">Tillgång:</strong> ladda ner allt vi har om dig under <Link className="text-gold underline" href="/profil#dina-uppgifter">Profil → Dina uppgifter</Link>.</li>
            <li><strong className="text-text">Rättelse:</strong> ändra namn, lag och avatar i din profil.</li>
            <li><strong className="text-text">Radering:</strong> radera ditt konto och all din data själv under Profil. Det går inte att ångra.</li>
            <li><strong className="text-text">Återkalla samtycke:</strong> radera kontot, eller be admin att ta bort ditt Hall of Fame-inlägg.</li>
            <li><strong className="text-text">Klagomål:</strong> du kan vända dig till Integritetsskyddsmyndigheten (IMY).</li>
          </ul>
        </Card>
      </div>
    </div>
  );
}
