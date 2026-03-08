import { after } from 'next/server'
import { NextResponse, type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase-admin'
import {
  getMondayOAuthConfig,
  verifyOAuthState,
  exchangeCodeForToken,
} from '@/lib/monday/oauth'
import { fetchCurrentUser } from '@/lib/monday/api'
import { registerWebhooksForConnection } from '@/lib/monday/webhooks'

/**
 * Handle Monday.com OAuth callback
 *
 * 1. Verify state parameter
 * 2. Exchange code for access token
 * 3. Fetch user info from Monday API
 * 4. Store connection in database
 * 5. Redirect back to app
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || ''

  if (process.env.MONDAY_FEATURE_ENABLED !== 'true') {
    return NextResponse.redirect(`${siteUrl}/?error=monday_disabled`)
  }

  const config = getMondayOAuthConfig()
  if (!config) {
    return NextResponse.redirect(`${siteUrl}/?error=monday_not_configured`)
  }

  // Check for Monday error
  const mondayError = searchParams.get('error')
  if (mondayError) {
    console.error('Monday.com OAuth error:', mondayError)
    return NextResponse.redirect(`${siteUrl}/?monday_error=${encodeURIComponent(mondayError)}`)
  }

  // Get code and state
  const code = searchParams.get('code')
  const state = searchParams.get('state')

  if (!code || !state) {
    return NextResponse.redirect(`${siteUrl}/?error=missing_oauth_params`)
  }

  // Verify state
  const stateResult = verifyOAuthState(state, config.signingSecret)
  if (!stateResult.valid || !stateResult.userId) {
    return NextResponse.redirect(`${siteUrl}/?error=invalid_state`)
  }

  const userId = stateResult.userId

  // Exchange code for token
  let tokenResponse
  try {
    tokenResponse = await exchangeCodeForToken(config, code)
  } catch (error) {
    console.error('Failed to exchange Monday code:', error)
    return NextResponse.redirect(`${siteUrl}/?error=token_exchange_failed`)
  }

  if (!tokenResponse.access_token) {
    console.error('Monday token error:', tokenResponse.error)
    return NextResponse.redirect(`${siteUrl}/?monday_error=${encodeURIComponent(tokenResponse.error || 'unknown')}`)
  }

  // Fetch user info from Monday API
  const mondayUser = await fetchCurrentUser(tokenResponse.access_token)
  if (!mondayUser) {
    return NextResponse.redirect(`${siteUrl}/?error=monday_user_fetch_failed`)
  }

  const accountId = String(mondayUser.account.id)
  const mondayUserId = String(mondayUser.id)

  // Store connection in database
  const supabase = createAdminClient()

  // Check if connection already exists for this user+account
  const { data: existing } = await supabase
    .from('monday_connections')
    .select('id')
    .eq('user_id', userId)
    .eq('account_id', accountId)
    .single()

  let connectionId: string

  if (existing) {
    // Update existing connection (re-authorization)
    const { error: updateError } = await supabase
      .from('monday_connections')
      .update({
        access_token: tokenResponse.access_token,
        scope: tokenResponse.scope,
        monday_user_id: mondayUserId,
        revoked_at: null,
      })
      .eq('id', existing.id)

    if (updateError) {
      console.error('Failed to update Monday connection:', updateError)
      return NextResponse.redirect(`${siteUrl}/?error=save_failed`)
    }

    connectionId = existing.id
  } else {
    // Insert new connection
    const { data: inserted, error: insertError } = await supabase
      .from('monday_connections')
      .insert({
        user_id: userId,
        account_id: accountId,
        monday_user_id: mondayUserId,
        access_token: tokenResponse.access_token,
        scope: tokenResponse.scope,
      })
      .select('id')
      .single()

    if (insertError || !inserted) {
      console.error('Failed to save Monday connection:', insertError)
      return NextResponse.redirect(`${siteUrl}/?error=save_failed`)
    }

    connectionId = inserted.id
  }

  // Register webhooks on all boards in the background (after response is sent)
  after(async () => {
    const adminSupabase = createAdminClient()
    await registerWebhooksForConnection(
      adminSupabase,
      connectionId,
      tokenResponse.access_token
    ).catch((err) => console.error('Monday webhook registration failed:', err))
  })

  return NextResponse.redirect(`${siteUrl}/?monday_connected=true`)
}
