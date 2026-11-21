import crypto from 'crypto';

let ephemeral: string | null = null;

/**
 * Key used to sign and verify login tokens.
 *
 * Set JWT_SECRET in the environment. If it is missing, a random key is created
 * for this process instead of a hard-coded one: the app keeps working, but every
 * restart signs everyone out until JWT_SECRET is set.
 */
export function getJwtSecret(): string {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
  if (!ephemeral) {
    ephemeral = crypto.randomBytes(48).toString('hex');
    console.warn('[SECURITY] JWT_SECRET is not set: using a temporary key. Users are signed out at every restart until you set JWT_SECRET.');
  }
  return ephemeral;
}
