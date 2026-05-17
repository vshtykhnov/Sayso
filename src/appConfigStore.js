import fs from 'node:fs';
import path from 'node:path';
import { loadConfig } from './config.js';

const CONFIG_FILE = 'config.json';

export function createConfigStore(userDataDir) {
  const filePath = path.join(userDataDir, CONFIG_FILE);

  return {
    filePath,
    load() {
      const saved = readJson(filePath);
      return {
        twitchChannel: saved.twitchChannel || '',
        twitchClientId: saved.twitchClientId || '',
        twitchUsername: saved.twitchUsername || '',
        twitchOAuthToken: saved.twitchOAuthToken || '',
        port: saved.port || 3000,
        usernameConnector: saved.usernameConnector ?? '',
        ttsCommand: saved.ttsCommand || '!tts',
        maxMessageLength: saved.maxMessageLength || 220,
        minSecondsBetweenMessages: saved.minSecondsBetweenMessages || 1.2,
        voiceVolume: saved.voiceVolume ?? 1,
        ttsEngine: saved.ttsEngine || 'browser',
        ttsLanguage: saved.ttsLanguage || 'en-US',
        obsRoute: saved.obsRoute || '/obs',
        piperVoiceId: saved.piperVoiceId || 'ru_RU-dmitri-medium',
        piperModelPath: saved.piperModelPath || '',
        piperConfigPath: saved.piperConfigPath || '',
        sileroSpeaker: saved.sileroSpeaker || 'xenia',
        sileroPythonPath: saved.sileroPythonPath || '',
        sileroScriptPath: saved.sileroScriptPath || '',
        sileroModelCacheDir: saved.sileroModelCacheDir || '',
        ignoredUsers: saved.ignoredUsers || 'nightbot,streamelements'
      };
    },
    save(settings) {
      fs.mkdirSync(userDataDir, { recursive: true });
      fs.writeFileSync(filePath, `${JSON.stringify(normalizeSettings(settings), null, 2)}\n`, 'utf8');
      return this.load();
    },
    toRuntimeConfig(settings = this.load()) {
      return loadConfig({
        TWITCH_CHANNEL: settings.twitchChannel,
        TWITCH_USERNAME: settings.twitchUsername,
        TWITCH_OAUTH_TOKEN: settings.twitchOAuthToken,
        PORT: String(settings.port),
        USERNAME_CONNECTOR: settings.usernameConnector ?? '',
        TTS_COMMAND: settings.ttsCommand,
        MAX_MESSAGE_LENGTH: String(settings.maxMessageLength),
        MIN_SECONDS_BETWEEN_MESSAGES: String(settings.minSecondsBetweenMessages),
        VOICE_VOLUME: String(settings.voiceVolume),
        TTS_ENGINE: settings.ttsEngine,
        TTS_LANGUAGE: settings.ttsLanguage,
        OBS_ROUTE: settings.obsRoute,
        PIPER_VOICE_ID: settings.piperVoiceId,
        PIPER_MODEL_PATH: settings.piperModelPath,
        PIPER_CONFIG_PATH: settings.piperConfigPath,
        SILERO_SPEAKER: settings.sileroSpeaker,
        SILERO_PYTHON_PATH: settings.sileroPythonPath,
        SILERO_SCRIPT_PATH: settings.sileroScriptPath,
        SILERO_MODEL_CACHE_DIR: settings.sileroModelCacheDir,
        IGNORED_USERS: settings.ignoredUsers
      });
    }
  };
}

function normalizeSettings(settings) {
  return {
    twitchChannel: String(settings.twitchChannel || '').trim().replace(/^#/, ''),
    twitchClientId: String(settings.twitchClientId || '').trim(),
    twitchUsername: String(settings.twitchUsername || '').trim(),
    twitchOAuthToken: String(settings.twitchOAuthToken || '').trim(),
    port: toNumber(settings.port, 3000),
    usernameConnector: String(settings.usernameConnector ?? ''),
    ttsCommand: normalizeCommand(settings.ttsCommand),
    maxMessageLength: toNumber(settings.maxMessageLength, 220),
    minSecondsBetweenMessages: toNumber(settings.minSecondsBetweenMessages, 1.2),
    voiceVolume: clampNumber(settings.voiceVolume, 1, 0, 1),
    ttsEngine: normalizeEngine(settings.ttsEngine),
    ttsLanguage: normalizeLanguage(settings.ttsLanguage),
    obsRoute: normalizeRoute(settings.obsRoute || '/obs'),
    piperVoiceId: String(settings.piperVoiceId || 'ru_RU-dmitri-medium').trim(),
    piperModelPath: String(settings.piperModelPath || '').trim(),
    piperConfigPath: String(settings.piperConfigPath || '').trim(),
    sileroSpeaker: normalizeSileroSpeaker(settings.sileroSpeaker),
    sileroPythonPath: String(settings.sileroPythonPath || '').trim(),
    sileroScriptPath: String(settings.sileroScriptPath || '').trim(),
    sileroModelCacheDir: String(settings.sileroModelCacheDir || '').trim(),
    ignoredUsers: String(settings.ignoredUsers || 'nightbot,streamelements').trim()
  };
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return {};
  }
}

function normalizeCommand(value) {
  const command = String(value || '!tts').trim().toLowerCase();
  return command.startsWith('!') ? command : `!${command}`;
}

function normalizeEngine(value) {
  const engine = String(value || 'browser').trim().toLowerCase();
  return ['browser', 'piper', 'silero'].includes(engine) ? engine : 'browser';
}

function normalizeLanguage(value) {
  const lang = String(value || 'en-US').trim();
  return /^[a-z]{2,3}-[A-Z]{2,4}$/.test(lang) ? lang : 'en-US';
}

function normalizeRoute(value) {
  const route = String(value || '/obs').trim();
  return route.startsWith('/') ? route : `/${route}`;
}

function normalizeSileroSpeaker(value) {
  const speaker = String(value || 'xenia').trim().toLowerCase();
  return ['aidar', 'baya', 'kseniya', 'xenia', 'eugene'].includes(speaker) ? speaker : 'xenia';
}

function toNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function clampNumber(value, fallback, min, max) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, number));
}
