import { relayToGateway, resolveAgent } from '../../agent/gateway-relay.js';

/**
 * Handles user messages in assistant threads — relays to PSA Agent Gateway.
 */
export const message = async ({ client, context, logger, message, say, setStatus }) => {
  if (!('text' in message) || !('thread_ts' in message) || !message.text || !message.thread_ts) {
    return;
  }

  try {
    const { channel, thread_ts } = message;
    const { userId, teamId } = context;

    const agentId = resolveAgent(channel);

    await setStatus({
      status: `connecting to ${agentId}...`,
    });

    const streamer = client.chatStream({
      channel,
      recipient_team_id: teamId,
      recipient_user_id: userId,
      thread_ts,
      task_display_mode: 'timeline',
    });

    await relayToGateway(streamer, message.text, agentId, thread_ts, userId);
    await streamer.stop();
  } catch (e) {
    logger.error(`Failed to relay message to gateway: ${e}`);
    await say(`:warning: Something went wrong! (${e.message || e})`);
  }
};
