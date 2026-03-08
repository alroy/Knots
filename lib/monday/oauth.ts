import crypto from 'crypto'

/**
 * Monday.com OAuth configuration
 */
export interface MondayOAuthConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  signingSecret: string
}

/**
 * Get OAuth config from environment
 */
export function getMondayOAuthConfig(): MondayOAuthConfig | null {
  const clientId = process.env.MONDAY_CLIENT_ID
  const clientSecret = process.env.MONDAY_CLIENT_SECRET
  const signingSecret = process.env.MONDAY_SIGNING_SECRET
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL

  if (!clientId || !clientSecret || !signingSecret || !siteUrl) {
    return null
  }

  return {
    clientId,
    clientSecret,
    redirectUri: `${siteUrl}/api/monday/oauth/callback`,
    signingSecret,
  }
}

/**
 * Generate OAuth state parameter with HMAC signature
 * Reuses same pattern as Slack OAuth
 */
export function generateOAuthState(userId: string, secret: string): string {
  const nonce = crypto.randomBytes(16).toString('hex')
  const data = `${userId}:${nonce}`
  const signature = crypto
    .createHmac('sha256', secret)
    .update(data)
    .digest('hex')
    .substring(0, 16)

  return `${data}:${signature}`
}

/**
 * Verify and parse OAuth state parameter
 */
export function verifyOAuthState(
  state: string,
  secret: string
): { valid: boolean; userId?: string } {
  const parts = state.split(':')
  if (parts.length !== 3) {
    return { valid: false }
  }

  const [userId, nonce, signature] = parts
  const data = `${userId}:${nonce}`
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(data)
    .digest('hex')
    .substring(0, 16)

  try {
    const isValid = crypto.timingSafeEqual(
      Buffer.from(signature, 'utf8'),
      Buffer.from(expectedSignature, 'utf8')
    )
    return { valid: isValid, userId: isValid ? userId : undefined }
  } catch {
    return { valid: false }
  }
}

/**
 * Build Monday.com OAuth authorization URL
 */
export function buildAuthUrl(config: MondayOAuthConfig, state: string): string {
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    state,
    scopes: 'me:read boards:read webhooks:write',
  })

  return `https://auth.monday.com/oauth2/authorize?${params.toString()}`
}

/**
 * Exchange OAuth code for access token
 */
export interface MondayOAuthResponse {
  access_token?: string
  token_type?: string
  scope?: string
  error?: string
}

export async function exchangeCodeForToken(
  config: MondayOAuthConfig,
  code: string
): Promise<MondayOAuthResponse> {
  const response = await fetch('https://auth.monday.com/oauth2/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      code,
      redirect_uri: config.redirectUri,
    }),
  })

  return response.json()
}

/**
 * Verify Monday.com webhook signature
 * Monday signs webhooks with the app's signing secret
 */
export function verifyWebhookSignature(
  body: string,
  signature: string,
  signingSecret: string
): boolean {
  const hmac = crypto
    .createHmac('sha256', signingSecret)
    .update(body)
    .digest('base64')

  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature, 'utf8'),
      Buffer.from(hmac, 'utf8')
    )
  } catch {
    return false
  }
}
