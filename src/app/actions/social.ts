"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { apiUser } from "@/lib/auth";
import { rateLimit } from "@/lib/security";

export async function toggleFollow(userId: string) {
  const me = await apiUser();
  if (!me) return { ok: false };
  const id = z.string().max(40).safeParse(userId);
  if (!id.success || id.data === me.id) return { ok: false };
  if (!rateLimit(`follow:${me.id}`, 60, 60_000).ok) return { ok: false };
  if (!(await db.user.findUnique({ where: { id: id.data } }))) return { ok: false };
  const key = { followerId_followedId: { followerId: me.id, followedId: id.data } };
  const exists = await db.follow.findUnique({ where: key });
  if (exists) await db.follow.delete({ where: key });
  else await db.follow.create({ data: { followerId: me.id, followedId: id.data } });
  revalidatePath("/tipstabell");
  return { ok: true, following: !exists };
}
