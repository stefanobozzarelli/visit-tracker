/**
 * Brute-force guard for password sign-in (the app and the Claude connector).
 *
 * After MAX_FAILURES wrong passwords for the same email from the same address
 * within WINDOW_MS, further attempts are refused until the window ends. A
 * successful sign-in clears the counter. In memory: the backend runs as a
 * single Railway service, and a restart simply resets the counters.
 */
const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 10;
const MAX_PER_IP = 50;

const failures = new Map<string, { count: number; reset: number }>();

function bump(key: string, now: number) {
  const entry = failures.get(key);
  if (!entry || entry.reset < now) failures.set(key, { count: 1, reset: now + WINDOW_MS });
  else entry.count += 1;
}

function count(key: string, now: number): number {
  const entry = failures.get(key);
  return entry && entry.reset >= now ? entry.count : 0;
}

const keys = (ip: string, email: string) => [`e:${ip}:${email.trim().toLowerCase()}`, `i:${ip}`];

export function isLoginBlocked(ip: string, email: string): boolean {
  const now = Date.now();
  const [byEmail, byIp] = keys(ip, email);
  return count(byEmail, now) >= MAX_FAILURES || count(byIp, now) >= MAX_PER_IP;
}

export function recordLoginFailure(ip: string, email: string) {
  const now = Date.now();
  for (const k of keys(ip, email)) bump(k, now);
  if (failures.size > 10000) {
    for (const [k, v] of failures) if (v.reset < now) failures.delete(k);
  }
}

export function clearLoginFailures(ip: string, email: string) {
  failures.delete(keys(ip, email)[0]);
}
