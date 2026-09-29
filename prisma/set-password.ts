/**
 * Sätter ett nytt lösenord på ett konto, t.ex. om admin har glömt sitt. Loggar ut kontot överallt.
 *
 *   fly ssh console --app <app> -C "env NEW_PASSWORD=<nytt lösenord> npx tsx prisma/set-password.ts anders@allsvenskantipset.se"
 *
 * Lokalt: NEW_PASSWORD=<nytt> npx tsx prisma/set-password.ts <e-post>
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const email = (process.argv[2] ?? "").trim().toLowerCase();
const pw = process.env.NEW_PASSWORD ?? "";

async function main() {
  if (!email) throw new Error("Ange e-postadressen: npx tsx prisma/set-password.ts <e-post>");
  if (pw.length < 10 || !/[a-zåäö]/i.test(pw) || !/[0-9]/.test(pw)) throw new Error("NEW_PASSWORD: minst 10 tecken med både bokstäver och siffror");
  const db = new PrismaClient();
  try {
    const user = await db.user.findUnique({ where: { email } });
    if (!user) throw new Error(`Hittar inget konto med e-post ${email}`);
    await db.user.update({ where: { id: user.id }, data: { passwordHash: await bcrypt.hash(pw, 11) } });
    await db.session.deleteMany({ where: { userId: user.id } });
    console.log(`Nytt lösenord satt för ${email}. Alla inloggningar på kontot är utloggade.`);
  } finally {
    await db.$disconnect();
  }
}

main().catch((e) => {
  console.error((e as Error).message);
  process.exit(1);
});
