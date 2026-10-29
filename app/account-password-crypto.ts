import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

const VERSION = "v1";
const COST = 32768;
const BLOCK_SIZE = 8;
// OWASP scrypt minimum profile: N=2^15, r=8, p=3 (32 MiB).
const PARALLELIZATION = 3;
const MAX_MEMORY = 64 * 1024 * 1024;
const SALT_BYTES = 16;
const KEY_BYTES = 32;
const MIN_CHARACTERS = 12;
const MAX_CHARACTERS = 128;
const MAX_INPUT_BYTES = 1024;

function validPassword(value: unknown): value is string {
  if (typeof value !== "string" || value.length < MIN_CHARACTERS || value.length > MAX_CHARACTERS * 2) return false;
  if (Buffer.byteLength(value, "utf8") > MAX_INPUT_BYTES) return false;
  const characters = Array.from(value).length;
  return characters >= MIN_CHARACTERS && characters <= MAX_CHARACTERS;
}

function derive(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, KEY_BYTES, { N: COST, r: BLOCK_SIZE, p: PARALLELIZATION, maxmem: MAX_MEMORY }, (error, key) => {
      if (error) reject(error);
      else resolve(key);
    });
  });
}

function decodedPart(value: string, expectedBytes: number): Buffer | null {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return null;
  const decoded = Buffer.from(value, "base64url");
  return decoded.length === expectedBytes && decoded.toString("base64url") === value ? decoded : null;
}

/** A versioned, salted record. Callers must store it as a secret and never log it. */
export async function hashAccountPassword(password: string): Promise<string> {
  if (!validPassword(password)) throw new Error("Invalid Account password length");
  const salt = randomBytes(SALT_BYTES);
  const key = await derive(password, salt);
  return `scrypt$${VERSION}$${COST}$${BLOCK_SIZE}$${PARALLELIZATION}$${salt.toString("base64url")}$${key.toString("base64url")}`;
}

/** Invalid inputs and unsupported or tampered records fail closed. */
export async function verifyAccountPassword(password: string, record: string): Promise<boolean> {
  if (!validPassword(password) || typeof record !== "string" || record.length > 200) return false;
  const parts = record.split("$");
  if (parts.length !== 7 || parts[0] !== "scrypt" || parts[1] !== VERSION ||
      parts[2] !== String(COST) || parts[3] !== String(BLOCK_SIZE) || parts[4] !== String(PARALLELIZATION)) return false;
  const salt = decodedPart(parts[5], SALT_BYTES);
  const expected = decodedPart(parts[6], KEY_BYTES);
  if (!salt || !expected) return false;
  const actual = await derive(password, salt);
  return timingSafeEqual(actual, expected);
}
