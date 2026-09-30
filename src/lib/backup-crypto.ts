/**
 * Kryptering av backupfiler (AES-256-GCM, nyckel från lösenfras via scrypt). Databasen innehåller e-postadresser,
 * lösenordshashar och tips, så en backup får aldrig ligga okrypterad utanför servern.
 * Format: "ATB1" | salt (16) | iv (12) | chiffertext | autentiseringstagg (16)
 */
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";

const MAGIC = Buffer.from("ATB1");

export function encryptBackup(data: Buffer, passphrase: string): Buffer {
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", scryptSync(passphrase, salt, 32), iv);
  const enc = Buffer.concat([cipher.update(data), cipher.final()]);
  return Buffer.concat([MAGIC, salt, iv, enc, cipher.getAuthTag()]);
}

export function decryptBackup(blob: Buffer, passphrase: string): Buffer {
  if (blob.length < 4 + 16 + 12 + 16 || !blob.subarray(0, 4).equals(MAGIC)) throw new Error("Okänt filformat – det här är inte en krypterad backup.");
  const salt = blob.subarray(4, 20);
  const iv = blob.subarray(20, 32);
  const tag = blob.subarray(blob.length - 16);
  const enc = blob.subarray(32, blob.length - 16);
  const decipher = createDecipheriv("aes-256-gcm", scryptSync(passphrase, salt, 32), iv);
  decipher.setAuthTag(tag);
  try {
    return Buffer.concat([decipher.update(enc), decipher.final()]);
  } catch {
    throw new Error("Kunde inte dekryptera – fel lösenfras eller skadad fil.");
  }
}
