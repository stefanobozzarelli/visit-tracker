// Offline authentication utilities
// Enables login and cached credential validation when offline

const OFFLINE_USER_KEY = 'offline_user'
const OFFLINE_CREDS_KEY = 'offline_credentials'

export interface OfflineUser {
  id: string
  email: string
  name: string
  role: string
}

/**
 * Hash password for offline validation (SHA-256, one-way)
 * This is NOT bcrypt - just for basic offline verification
 * Uses SubtleCrypto API for SHA-256 hashing
 */
export async function hashPassword(password: string): Promise<string> {
  try {
    const encoder = new TextEncoder()
    const data = encoder.encode(password)
    const hashBuffer = await crypto.subtle.digest('SHA-256', data)
    const hashArray = Array.from(new Uint8Array(hashBuffer))
    const hashHex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
    return hashHex
  } catch (error) {
    console.warn('Error hashing password with SubtleCrypto, using fallback:', error)
    // Fallback: simple hash if SubtleCrypto fails
    return simpleHash(password)
  }
}

/**
 * Simple hash function for fallback when SubtleCrypto is unavailable
 */
function simpleHash(str: string): string {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = (hash << 5) - hash + char
    hash = hash & hash // Convert to 32bit integer
  }
  return 'hash_' + Math.abs(hash).toString(16)
}

/**
 * Save credentials and user info for offline access
 * Called after successful online login
 */
export async function saveOfflineCredentials(email: string, passwordHash: string, token: string, user: OfflineUser): Promise<void> {
  try {
    // Save user object
    localStorage.setItem(OFFLINE_USER_KEY, JSON.stringify(user))

    // Save credentials for verification (including token for offline use)
    localStorage.setItem(OFFLINE_CREDS_KEY, JSON.stringify({
      email,
      passwordHash,
      token, // Save the actual JWT token for offline authentication
      savedAt: Date.now(),
    }))
  } catch (error) {
    console.error('Failed to save offline credentials:', error)
  }
}

/**
 * Validate credentials against cached hash
 * Returns user object if valid, null otherwise
 */
export async function validateOfflineCredentials(email: string, password: string): Promise<OfflineUser | null> {
  try {
    const credsStr = localStorage.getItem(OFFLINE_CREDS_KEY)
    const userStr = localStorage.getItem(OFFLINE_USER_KEY)

    if (!credsStr || !userStr) {
      return null
    }

    const creds = JSON.parse(credsStr)
    const user = JSON.parse(userStr)

    // Verify email and password
    if (creds.email !== email) {
      return null
    }

    const providedHash = await hashPassword(password)
    if (creds.passwordHash !== providedHash) {
      return null
    }

    return user as OfflineUser
  } catch (error) {
    console.error('Error validating offline credentials:', error)
    return null
  }
}

/**
 * Get the saved JWT token for offline authentication
 * Returns the token string if available, null otherwise
 */
export function getOfflineToken(): string | null {
  try {
    const credsStr = localStorage.getItem(OFFLINE_CREDS_KEY)
    if (!credsStr) {
      return null
    }
    const creds = JSON.parse(credsStr)
    return creds.token || null
  } catch (error) {
    console.error('Error getting offline token:', error)
    return null
  }
}

/**
 * Get cached user object (for offline mode)
 */
export function getOfflineUser(): OfflineUser | null {
  try {
    const userStr = localStorage.getItem(OFFLINE_USER_KEY)
    return userStr ? JSON.parse(userStr) : null
  } catch (error) {
    console.error('Error getting offline user:', error)
    return null
  }
}

/**
 * Clear offline credentials on logout
 */
export function clearOfflineCredentials(): void {
  try {
    localStorage.removeItem(OFFLINE_USER_KEY)
    localStorage.removeItem(OFFLINE_CREDS_KEY)
  } catch (error) {
    console.error('Error clearing offline credentials:', error)
  }
}

/**
 * Validate JWT token format and expiration
 * Returns true if token is still valid
 */
export function validateJWTToken(token: string): boolean {
  try {
    // JWT format: header.payload.signature
    const parts = token.split('.')
    if (parts.length !== 3) {
      return false
    }

    // Decode payload
    const payload = JSON.parse(atob(parts[1]))

    // Check expiration
    if (payload.exp) {
      const expirationTime = payload.exp * 1000 // Convert to ms
      if (Date.now() > expirationTime) {
        return false
      }
    }

    return true
  } catch (error) {
    console.error('Error validating JWT token:', error)
    return false
  }
}
