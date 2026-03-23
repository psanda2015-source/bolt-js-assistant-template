/**
 * PSA Agent Gateway relay — replaces the OpenAI LLM caller.
 * Forwards messages to the gateway's /api/chat endpoint and
 * streams the SSE response back to Slack.
 */

const GATEWAY_URL = process.env.GATEWAY_URL || 'https://gateway-production-3500.up.railway.app';
const GATEWAY_API_KEY = process.env.GATEWAY_API_KEY;
const DEFAULT_AGENT = process.env.DEFAULT_AGENT || 'executive-assistant';

// Channel ID -> agent ID mapping (configure via CHANNEL_ROUTES env var)
// Format: "C123=sales-assistant,C456=cfo-agent,C789=pm-agent"
const channelRoutes = new Map();
if (process.env.CHANNEL_ROUTES) {
  for (const pair of process.env.CHANNEL_ROUTES.split(',')) {
    const [channelId, agentId] = pair.trim().split('=');
    if (channelId && agentId) {
      channelRoutes.set(channelId, agentId);
    }
  }
}

/**
 * Resolve which agent to route to based on channel ID.
 * @param {string} channelId - Slack channel ID
 * @returns {string} agent ID
 */
export function resolveAgent(channelId) {
  return channelRoutes.get(channelId) || DEFAULT_AGENT;
}

/**
 * Forward a message to the PSA Agent Gateway and stream the response to Slack.
 *
 * @param {import("@slack/web-api").ChatStreamer} streamer - Slack chat stream
 * @param {string} message - User message text
 * @param {string} agentId - Gateway agent ID to route to
 * @param {string} conversationId - Conversation ID (Slack thread_ts)
 * @param {string} [slackUserId] - Slack user ID for tracking
 */
export async function relayToGateway(streamer, message, agentId, conversationId, slackUserId) {
  const response = await fetch(`${GATEWAY_URL}/api/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Api-Key': GATEWAY_API_KEY,
      'X-User-Id': `slack-${slackUserId || 'unknown'}`,
      'X-User-Name': 'Slack User',
    },
    body: JSON.stringify({
      agentId,
      message,
      conversationId: `slack-${conversationId}`,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gateway returned ${response.status}: ${errorText}`);
  }

  // Parse SSE stream from gateway
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let fullText = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    let currentEvent = '';
    for (const line of lines) {
      if (line.startsWith('event: ')) {
        currentEvent = line.slice(7).trim();
      } else if (line.startsWith('data: ') && currentEvent) {
        const rawData = line.slice(6);
        try {
          const data = JSON.parse(rawData);

          if (currentEvent === 'text_delta' && data) {
            fullText += data;
            await streamer.append({
              markdown_text: data,
            });
          }
          // tool_call and tool_result events are handled silently
          // (gateway runs tools server-side)
        } catch {
          // Non-JSON data, skip
        }
        currentEvent = '';
      }
    }
  }

  if (!fullText) {
    await streamer.append({
      markdown_text: '_No response from agent._',
    });
  }
}
