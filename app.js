import 'dotenv/config';
import http from 'node:http';
import { App, LogLevel } from '@slack/bolt';
import { registerListeners } from './listeners/index.js';

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  appToken: process.env.SLACK_APP_TOKEN,
  socketMode: true,
  logLevel: LogLevel.DEBUG,
});

registerListeners(app);

// Log all unhandled errors
app.error(async (error) => {
  console.error('GLOBAL APP ERROR:', error);
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
    console.error('Failed to start the app', error);
    process.exit(1);
  }
})();
