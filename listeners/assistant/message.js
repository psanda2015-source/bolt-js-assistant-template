import { relayToGateway, resolveAgent } from '../../agent/gateway-relay.js';

export const message = async ({ client, context, logger, message, say, setStatus }) => {
  console.log('>>> MESSAGE RECEIVED:', JSON.stringify({ text: message.text, thread_ts: message.thread_ts, channel: message.channel }));

  if (!('text' in message) || !('thread_ts' in message) || !message.text || !message.thread_ts) {
    console.log('>>> SKIPPING: missing text or thread_ts');
    return;
  }

  try {
    const { channel, thread_ts } = message;
    const { userId, teamId } = context;
    const agentId = resolveAgent(channel);

    console.log(`>>> ROUTING to ${agentId} for user ${userId}`);

    await setStatus({ status: `connecting to ${agentId}...` });

    const streamer = client.chatStream({
      channel,
      recipient_team_id: teamId,
      recipient_user_id: userId,
      thread_ts,
      task_display_mode: 'timeline',
    });

    await relayToGateway(streamer, message.text, agentId, thread_ts, userId);
    await streamer.stop();
    console.log('>>> RELAY COMPLETE');
  } catch (e) {
    console.error('>>> RELAY ERROR:', e);
    await say(`:warning: Something went wrong! (${e.message || e})`);
  }
};
