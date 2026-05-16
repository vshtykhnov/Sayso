import 'dotenv/config';
import { createTtsServer } from './ttsServer.js';
import { loadConfig } from './config.js';
import { createConsoleLogger } from './logger.js';

const config = loadConfig();

if (!config.twitch.channel) {
  console.error('TWITCH_CHANNEL is not set. Copy .env.example to .env and set your channel name.');
  process.exit(1);
}

const appServer = createTtsServer(config, {
  logger: createConsoleLogger()
});

appServer.start().catch((error) => {
  console.error('Failed to start MiljenTTS server.');
  console.error(error);
  process.exit(1);
});
