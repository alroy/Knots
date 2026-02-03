/**
 * Slack Permalink Utilities
 *
 * Functions for fetching and computing Slack message permalinks.
 * Permalinks are required for task provenance and user navigation.
 */

/**
 * Slack chat.getPermalink API response
 */
interface SlackPermalinkResponse {
  ok: boolean
  permalink?: string
  error?: string
}

/**
 * Fetch permalink for a Slack message using the chat.getPermalink API
 *
 * @param accessToken - Bot or user OAuth access token
 * @param channelId - Slack channel ID
 * @param messageTs - Message timestamp
 * @returns Permalink URL or null on error
 */
export async function fetchSlackPermalink(
  accessToken: string,
  channelId: string,
  messageTs: string
): Promise<string | null> {
  try {
    const url = new URL('https://slack.com/api/chat.getPermalink')
    url.searchParams.set('channel', channelId)
    url.searchParams.set('message_ts', messageTs)

    const response = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    })

    const data: SlackPermalinkResponse = await response.json()

    if (!data.ok || !data.permalink) {
      console.error('Failed to fetch Slack permalink:', data.error)
      return null
    }

    return data.permalink
  } catch (error) {
    console.error('Error fetching Slack permalink:', error)
    return null
  }
}

/**
 * Construct a best-effort permalink without API call
 *
 * This generates a URL that should work for most cases but may not
 * work for private channels or certain workspace configurations.
 *
 * Format: https://[workspace].slack.com/archives/[channel]/p[timestamp]
 *
 * Note: We cannot construct the full URL without knowing the workspace domain,
 * so this function returns a partial URL that requires the domain to be prepended.
 *
 * @param channelId - Slack channel ID
 * @param messageTs - Message timestamp (e.g., "1700000000.000000")
 * @returns Partial permalink path
 */
export function constructPermalinkPath(
  channelId: string,
  messageTs: string
): string {
  // Convert timestamp from "1700000000.000000" to "p1700000000000000"
  const timestampNoDot = messageTs.replace('.', '')
  return `/archives/${channelId}/p${timestampNoDot}`
}

/**
 * Construct a full permalink with workspace domain
 *
 * @param workspaceDomain - Slack workspace domain (e.g., "acme" for acme.slack.com)
 * @param channelId - Slack channel ID
 * @param messageTs - Message timestamp
 * @returns Full permalink URL
 */
export function constructFullPermalink(
  workspaceDomain: string,
  channelId: string,
  messageTs: string
): string {
  const path = constructPermalinkPath(channelId, messageTs)
  return `https://${workspaceDomain}.slack.com${path}`
}

/**
 * Ensure a message has a permalink, fetching if necessary
 *
 * @param accessToken - Bot or user OAuth access token
 * @param channelId - Slack channel ID
 * @param messageTs - Message timestamp
 * @param existingPermalink - Existing permalink if already fetched
 * @returns Permalink URL or null if unavailable
 */
export async function ensurePermalink(
  accessToken: string,
  channelId: string,
  messageTs: string,
  existingPermalink?: string
): Promise<string | null> {
  // Return existing if valid
  if (existingPermalink && existingPermalink.startsWith('https://')) {
    return existingPermalink
  }

  // Fetch from API
  return fetchSlackPermalink(accessToken, channelId, messageTs)
}
