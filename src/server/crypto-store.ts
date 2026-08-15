import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { dataDirectory } from "./data-directory";

const masterKeyPath = join(dataDirectory, "master.key");

function masterKey(): Buffer {
  mkdirSync(dirname(masterKeyPath), { recursive: true });
  if (!existsSync(masterKeyPath)) writeFileSync(masterKeyPath, randomBytes(32), { mode: 0o600, flag: "wx" });
  const key = readFileSync(masterKeyPath);
  if (key.length !== 32) throw new Error("DialogueLab master key is invalid.");
  return key;
}

export function encryptSecret(value: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", masterKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), encrypted].map((part) => part.toString("base64url")).join(".");
}

export function decryptSecret(value: string): string {
  const [iv, tag, encrypted] = value.split(".").map((part) => Buffer.from(part, "base64url"));
  if (!iv || !tag || !encrypted) throw new Error("Stored provider key is invalid.");
  const decipher = createDecipheriv("aes-256-gcm", masterKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}
