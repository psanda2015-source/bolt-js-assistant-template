import { relayToGateway, resolveAgent } from '../../agent/gateway-relay.js';

/**
 * Handles @mentions in channels — relays to PSA Agent Gateway.
 * Routes to the agent mapped to this channel (or default agent).
 */
export const appMentionCallback = async ({ event, client, logger, say }) => {
  try {
    const { channel, text, team, user } = event;
    const thread_ts = event.thread_ts || event.ts;

    const agentId = resolveAgent(channel);

    await client.assistant.threads.setStatus({
      channel_id: channel,
      thread_ts,
      status: `connecting to ${agentId}...`,
    });

    const streamer = client.chatStream({
      channel,
      recipient_team_id: team,
      recipient_user_id: user,
      thread_ts,
    });

    // Strip the bot mention from the message text
    const cleanText = text.replace(/<@[A-Z0-9]+>/g, '').trim();

    await relayToGateway(streamer, cleanText, agentId, thread_ts, user);
    await streamer.stop();
  } catch (e) {
    logger.error(`Failed to handle app mention: ${e}`);
    await say(`:warning: Something went wrong! (${e.message || e})`);
  }
};
