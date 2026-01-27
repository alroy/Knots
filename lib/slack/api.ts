/**
 * Slack Web API helpers for resolving user information
 */

export interface SlackUserInfo {
  id: string
  name: string
  real_name?: string
  display_name?: string
}

export interface SlackUserMap {
  [userId: string]: string // userId -> display name
}

interface SlackApiResponse {
  ok: boolean
  error?: string
}

interface SlackUsersInfoResponse extends SlackApiResponse {
  user?: {
    id: string
    name: string
    real_name?: string
    profile?: {
      display_name?: string
      real_name?: string
    }
  }
}

/**
 * Fetch user info from Slack API
 */
export async function fetchSlackUser(
  accessToken: string,
  userId: string
): Promise<SlackUserInfo | null> {
  try {
    const response = await fetch(
      `https://slack.com/api/users.info?user=${userId}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    )

    const data: SlackUsersInfoResponse = await response.json()

    if (!data.ok || !data.user) {
      console.error('Failed to fetch Slack user:', data.error)
      return null
    }

    const displayName =
      data.user.profile?.display_name ||
      data.user.profile?.real_name ||
      data.user.real_name ||
      data.user.name

    return {
      id: data.user.id,
      name: data.user.name,
      real_name: data.user.real_name,
      display_name: displayName,
    }
  } catch (error) {
    console.error('Error fetching Slack user:', error)
    return null
  }
}

/**
 * Extract user IDs from Slack message text
 * Matches patterns like <@U123ABC>
 */
export function extractUserIdsFromText(text: string): string[] {
  const matches = text.match(/<@([A-Z0-9]+)>/gi) || []
  return [...new Set(matches.map((m) => m.slice(2, -1)))]
}

/**
 * Resolve multiple user IDs to a user map
 * Returns a map of userId -> display name
 */
export async function resolveUserMentions(
  accessToken: string,
  text: string
): Promise<SlackUserMap> {
  const userIds = extractUserIdsFromText(text)
  const userMap: SlackUserMap = {}

  // Fetch all users in parallel (with a reasonable limit)
  const fetchPromises = userIds.slice(0, 10).map(async (userId) => {
    const user = await fetchSlackUser(accessToken, userId)
    if (user && user.display_name) {
      userMap[userId] = user.display_name
    }
  })

  await Promise.all(fetchPromises)
  return userMap
}
