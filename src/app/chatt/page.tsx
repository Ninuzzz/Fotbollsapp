import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { getActiveSeason } from "@/lib/season";
import { canChat } from "@/lib/chat-access";
import { PageHeader } from "@/components/ui";
import { PaymentWaiting } from "@/components/payment-waiting";
import { Chat } from "./chat";

export const metadata = { title: "Chatt" };

export default async function ChatPage() {
  const user = await requireUser();
  const season = await getActiveSeason();
  if (!season) return null;
  const allowed = await canChat(user, season.id);
  const entry = allowed ? null : await db.entry.findUnique({ where: { userId_seasonId: { userId: user.id, seasonId: season.id } } });
  return (
    <div className="mx-auto max-w-4xl px-4 py-8 md:px-6 md:py-12">
      <PageHeader kicker={season.name} title="Omklädningsrummet">
        Snacka tips, skryt om raketer och trösta djupdykare.
      </PageHeader>
      {allowed ? (
        <Chat me={{ id: user.id, role: user.role }} />
      ) : (
        <PaymentWaiting
          status={entry?.paymentStatus ?? "PENDING"}
          fee={season.entryFee}
          swish={season.swishNumber}
          paidBy={entry?.paidBy ?? ""}
          context="chatt"
        />
      )}
    </div>
  );
}
