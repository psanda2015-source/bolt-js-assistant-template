import 'dotenv/config';
import http from 'node:http';
import { App, LogLevel } from '@slack/bolt';
import { relayToGateway, resolveAgent } from './agent/gateway-relay.js';

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  appToken: process.env.SLACK_APP_TOKEN,
  socketMode: true,
  logLevel: LogLevel.DEBUG,
});

// Handle DMs
app.event('message', async ({ event, client, logger }) => {
  // Skip bot messages, edits, deletions
  if (event.bot_id || event.subtype) return;

  console.log('>>> DM received:', event.text);

  const thread_ts = event.thread_ts || event.ts;
  const agentId = resolveAgent(event.channel);

  try {
    // Send typing indicator
    const typing = await client.chat.postMessage({
      channel: event.channel,
      thread_ts,
      text: `_Connecting to ${agentId}..._`,
    });

    // Collect full response from gateway
    let fullText = '';
    const fakeStreamer = {
      append: async ({ chunks }) => {
        for (const chunk of chunks) {
          if (chunk.type === 'markdown_text') {
            fullText += chunk.text;
          }
        }
      },
      stop: async () => {},
    };

    await relayToGateway(fakeStreamer, event.text, agentId, thread_ts, event.user);

    // Update the typing message with the real response
    await client.chat.update({
      channel: event.channel,
      ts: typing.ts,
      text: fullText || '_No response from agent._',
    });

    console.log('>>> Reply sent');
  } catch (e) {
    console.error('>>> ERROR:', e);
    await client.chat.postMessage({
      channel: event.channel,
      thread_ts,
      text: `:warning: Something went wrong: ${e.message || e}`,
    });
  }
});

// Handle @mentions in channels
app.event('app_mention', async ({ event, client, logger }) => {
  console.log('>>> Mention received:', event.text);

  const thread_ts = event.thread_ts || event.ts;
  const agentId = resolveAgent(event.channel);
  const cleanText = event.text.replace(/<@[A-Z0-9]+>/g, '').trim();

  try {
    const typing = await client.chat.postMessage({
      channel: event.channel,
      thread_ts,
      text: `_Connecting to ${agentId}..._`,
    });

    let fullText = '';
    const fakeStreamer = {
      append: async ({ chunks }) => {
        for (const chunk of chunks) {
          if (chunk.type === 'markdown_text') {
            fullText += chunk.text;
          }
        }
      },
      stop: async () => {},
    };

    await relayToGateway(fakeStreamer, cleanText, agentId, thread_ts, event.user);

    await client.chat.update({
      channel: event.channel,
      ts: typing.ts,
      text: fullText || '_No response from agent._',
    });

    console.log('>>> Reply sent');
  } catch (e) {
    console.error('>>> ERROR:', e);
    await client.chat.postMessage({
      channel: event.channel,
      thread_ts,
      text: `:warning: Something went wrong: ${e.message || e}`,
    });
  }
});

app.error(async (error) => {
  console.error('GLOBAL ERROR:', error);
});

const healthPort = process.env.PORT || 3000;
http.createServer((_req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ status: 'ok', service: 'psa-slack-bot' }));
}).listen(healthPort, '0.0.0.0');

(async () => {
  try {
    await app.start();
    console.log(`PSA Slack Bot running (Socket Mode) | Health: http://0.0.0.0:${healthPort}`);
  } catch (error) {
    console.error('Failed to start:', error);
    process.exit(1);
  }
})();
