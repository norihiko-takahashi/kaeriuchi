/**
 * PIN のハッシュ（U1-SEC-4）。
 * PBKDF2（SHA-256）、繰り返し 600,000 回、ソルトは16バイトのランダム。
 * 形式：pbkdf2-sha256$<回数>$<ソルト(base64)>$<ハッシュ(base64)>
 *
 * PIN は「子どもよけ」で、データを守る鍵ではない（nfr-requirements.md §4）。
 */
const ITERATIONS = 600_000;
const SALT_BYTES = 16;
const HASH_BITS = 256;

const toB64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const fromB64 = (b64: string) =>
  Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

async function derive(
  pin: string,
  salt: Uint8Array,
  iterations: number,
): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(pin),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: salt as BufferSource, iterations },
    key,
    HASH_BITS,
  );
  return new Uint8Array(bits);
}

export async function hashPin(
  pin: string,
  iterations = ITERATIONS,
): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const hash = await derive(pin, salt, iterations);
  return `pbkdf2-sha256$${iterations}$${toB64(salt)}$${toB64(hash)}`;
}

export async function verifyPin(pin: string, stored: string): Promise<boolean> {
  const [scheme, iter, saltB64, hashB64] = stored.split("$");
  if (scheme !== "pbkdf2-sha256" || !iter || !saltB64 || !hashB64) return false;
  const expected = fromB64(hashB64);
  const actual = await derive(pin, fromB64(saltB64), Number(iter));
  if (actual.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < actual.length; i++) diff |= actual[i] ^ expected[i];
  return diff === 0;
}
