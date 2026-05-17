import express from 'express';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import tmi from 'tmi.js';
import { getPublicConfig } from './config.js';
import { createTestMessage, prepareChatMessage } from './messageFilter.js';
import { createConsoleLogger } from './logger.js';
import { createTtsEngineRuntime } from './ttsEngines.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

export function createTtsServer(config, options = {}) {
  const publicDir = options.publicDir || path.join(rootDir, 'public');
  const logger = options.logger || createConsoleLogger();
  const app = express();
  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: '/ws' });
  const ttsRuntime = createTtsEngineRuntime(config, {
    logger,
    userDataDir: options.userDataDir
  });
  const clients = new Set();
  const listeners = new Set();
  let twitchClient = null;
  let started = false;

  app.use(express.json());

  app.get('/', (_req, res) => {
    res.redirect(config.tts.obsRoute || '/obs');
  });

  app.get('/obs', (_req, res) => {
    res.sendFile(path.join(publicDir, 'obs.html'));
  });

  app.get('/audio/:file', (req, res) => {
    const fileName = path.basename(req.params.file);
    const filePath = path.join(ttsRuntime.audioDir, fileName);

    res.sendFile(filePath, (error) => {
      if (error && !res.headersSent) {
        res.status(404).end();
      }
    });
  });

  app.use(express.static(publicDir));

  app.get('/api/config', (_req, res) => {
    res.json(getPublicConfig(config));
  });

  app.post('/api/test-message', async (req, res) => {
    const text = typeof req.body?.text === 'string' ? req.body.text : undefined;
    const payload = createTestMessage(config, text);

    logger.info('Test message queued.', {
      channel: payload.channel,
      textLength: payload.text.length
    });
    try {
      const enriched = await queueMessage(payload);
      res.json({ ok: true, message: enriched });
    } catch (error) {
      logger.error('Failed to queue test message.', {
        reason: error?.message || String(error)
      });
      res.status(500).json({
        ok: false,
        reason: error?.message || String(error)
      });
    }
  });

  app.post('/api/tts-settings', (req, res) => {
    const settings = normalizeTtsSettings(req.body, config);
    Object.assign(config.tts, settings);

    logger.info('TTS playback settings updated.', settings);
    broadcast({
      type: 'tts-settings',
      settings
    });
    res.json({ ok: true, settings });
  });

  app.get('/api/tts-engines', (_req, res) => {
    res.json({
      engines: ttsRuntime.listEngines(),
      voices: ttsRuntime.listVoices()
    });
  });

  wss.on('connection', (socket) => {
    clients.add(socket);
    logger.info('OBS browser source connected.', {
      clients: clients.size
    });
    socket.send(
      JSON.stringify({
        type: 'status',
        status: config.twitch.hasCredentials ? 'connected' : 'missing-token',
        channel: config.twitch.channel,
        hasTwitchCredentials: config.twitch.hasCredentials
      })
    );
    socket.send(
      JSON.stringify({
        type: 'tts-settings',
        settings: getTtsSettingsFromConfig(config)
      })
    );

    socket.on('close', () => {
      clients.delete(socket);
      logger.info('OBS browser source disconnected.', {
        clients: clients.size
      });
    });
  });

  return {
    app,
    port: config.port,
    url: `http://localhost:${config.port}`,
    onStatus(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async start() {
      if (started) {
        return this;
      }

      await listen(server, config.port);
      started = true;
      emit({
        type: 'server',
        status: 'server-started',
        message: `OBS page: http://localhost:${config.port}`,
        url: `http://localhost:${config.port}`
      });
      logger.info('Server started.', {
        url: `http://localhost:${config.port}`,
        obsUrl: `http://localhost:${config.port}${config.tts.obsRoute}`,
        channel: config.twitch.channel,
        ttsCommand: config.filters.ttsCommand
      });

      if (config.twitch.hasCredentials) {
        connectTwitchChat();
      } else {
        logger.warn('Twitch credentials are missing. Server is running in test mode.');
        emit({
          type: 'twitch',
          status: 'missing-token',
          message: 'Missing TWITCH_USERNAME or TWITCH_OAUTH_TOKEN. Local UI is running in test mode.'
        });
      }

      return this;
    },
    async stop() {
      if (!started) {
        return;
      }

      for (const socket of clients) {
        socket.close();
      }

      await Promise.allSettled([
        twitchClient?.disconnect?.(),
        close(wss),
        close(server)
      ]);

      twitchClient = null;
      started = false;
      emit({
        type: 'server',
        status: 'server-stopped',
        message: 'Server stopped.'
      });
      logger.info('Server stopped.');
    },
    broadcast
  };

  function connectTwitchChat() {
    logger.info('Connecting to Twitch chat.', {
      channel: config.twitch.channel,
      username: config.twitch.username
    });

    twitchClient = new tmi.Client({
      connection: {
        reconnect: true,
        secure: true
      },
      identity: {
        username: config.twitch.username,
        password: config.twitch.oauthToken
      },
      channels: [config.twitch.channel]
    });

    twitchClient.on('connected', (address, twitchPort) => {
      const payload = {
        type: 'status',
        status: 'twitch-connected',
        channel: config.twitch.channel
      };

      emit({
        type: 'twitch',
        status: 'twitch-connected',
        message: `Connected to Twitch chat ${address}:${twitchPort}, channel #${config.twitch.channel}`
      });
      logger.info('Connected to Twitch chat.', {
        address,
        twitchPort,
        channel: config.twitch.channel
      });
      broadcast(payload);
    });

    twitchClient.on('disconnected', (reason) => {
      const payload = {
        type: 'status',
        status: 'twitch-disconnected',
        reason
      };

      emit({
        type: 'twitch',
        status: 'twitch-disconnected',
        message: `Disconnected from Twitch chat: ${reason}`
      });
      logger.warn('Disconnected from Twitch chat.', {
        reason
      });
      broadcast(payload);
    });

    twitchClient.on('message', (messageChannel, userstate, message, self) => {
      if (self) {
        return;
      }

      const payload = prepareChatMessage(message, userstate, messageChannel, config);

      if (payload) {
        queueMessage(payload).catch((error) => {
          logger.error('Failed to queue chat message.', {
            username: payload.username,
            reason: error?.message || String(error)
          });
          broadcast({
            type: 'status',
            status: 'tts-error',
            reason: error?.message || String(error)
          });
        });
      }
    });

    twitchClient.connect().catch((error) => {
      const reason = error?.message || String(error);

      emit({
        type: 'twitch',
        status: 'twitch-error',
        message: `Failed to connect to Twitch chat: ${reason}`
      });
      logger.error('Failed to connect to Twitch chat.', {
        reason
      });
      broadcast({
        type: 'status',
        status: 'twitch-error',
        reason
      });
    });
  }

  function broadcast(payload) {
    const serialized = JSON.stringify(payload);

    for (const socket of clients) {
      if (socket.readyState === socket.OPEN) {
        socket.send(serialized);
      }
    }
  }

  function emit(event) {
    for (const listener of listeners) {
      listener(event);
    }
  }

  async function queueMessage(payload) {
    logger.info('TTS message accepted.', {
      channel: payload.channel,
      username: payload.username,
      textLength: payload.text.length,
      ttsEngine: config.tts.ttsEngine
    });

    const enriched = await ttsRuntime.enrichMessage(payload);
    broadcast(enriched);
    return enriched;
  }
}

function getTtsSettingsFromConfig(config) {
  return {
    voiceVolume: config.tts.voiceVolume,
    ttsEngine: config.tts.ttsEngine,
    ttsLanguage: config.tts.ttsLanguage,
    piperVoiceId: config.tts.piperVoiceId,
    sileroSpeaker: config.tts.sileroSpeaker
  };
}

function normalizeTtsSettings(value, config) {
  return {
    voiceVolume: clampNumber(value?.voiceVolume, 1, 0, 1),
    ttsEngine: normalizeEngine(value?.ttsEngine, config.tts.ttsEngine),
    ttsLanguage: normalizeLanguage(value?.ttsLanguage, config.tts.ttsLanguage),
    piperVoiceId: typeof value?.piperVoiceId === 'string' ? value.piperVoiceId : config.tts.piperVoiceId,
    sileroSpeaker: normalizeSileroSpeaker(value?.sileroSpeaker || config.tts.sileroSpeaker)
  };
}

function normalizeEngine(value, fallback) {
  const engine = String(value || fallback || 'browser').toLowerCase();
  return ['browser', 'piper', 'silero'].includes(engine) ? engine : 'browser';
}

function normalizeLanguage(value, fallback) {
  const lang = String(value || fallback || 'en-US').trim();
  return /^[a-z]{2,3}-[A-Z]{2,4}$/.test(lang) ? lang : (fallback || 'en-US');
}

function normalizeSileroSpeaker(value) {
  const speaker = String(value || 'xenia').toLowerCase();
  return ['aidar', 'baya', 'kseniya', 'xenia', 'eugene'].includes(speaker) ? speaker : 'xenia';
}

function clampNumber(value, fallback, min, max) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, number));
}

function listen(server, port) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, () => {
      server.off('error', reject);
      resolve();
    });
  });
}

function close(target) {
  return new Promise((resolve) => {
    if (!target) {
      resolve();
      return;
    }

    target.close(() => resolve());
  });
}
