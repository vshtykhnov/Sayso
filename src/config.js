const DEFAULTS = {
  port: 3000,
  readUsernames: true,
  ttsCommand: '!tts',
  maxMessageLength: 220,
  minSecondsBetweenMessages: 1.2,
  voiceVolume: 1,
  voiceRate: 1,
  voicePitch: 1,
  ttsEngine: 'browser',
  obsRoute: '/obs',
  piperVoiceId: 'ru_RU-dmitri-medium',
  sileroSpeaker: 'xenia',
  ignoredUsers: ['nightbot', 'streamelements']
};

export function loadConfig(env = process.env) {
  const channel = normalizeChannel(env.TWITCH_CHANNEL);
  const username = env.TWITCH_USERNAME?.trim() || '';
  const oauthToken = normalizeOAuthToken(env.TWITCH_OAUTH_TOKEN);
  const hasCredentials = isRealTwitchCredential(username, oauthToken);

  return {
    port: parseNumber(env.PORT, DEFAULTS.port),
    twitch: {
      channel,
      username,
      oauthToken,
      hasCredentials
    },
    tts: {
      readUsernames: parseBool(env.READ_USERNAMES, DEFAULTS.readUsernames),
      maxMessageLength: parseNumber(env.MAX_MESSAGE_LENGTH, DEFAULTS.maxMessageLength),
      minSecondsBetweenMessages: parseNumber(
        env.MIN_SECONDS_BETWEEN_MESSAGES,
        DEFAULTS.minSecondsBetweenMessages
      ),
      voiceVolume: parseRangeNumber(env.VOICE_VOLUME, DEFAULTS.voiceVolume, 0, 1),
      voiceRate: parseRangeNumber(env.VOICE_RATE, DEFAULTS.voiceRate, 0.7, 1.4),
      voicePitch: parseRangeNumber(env.VOICE_PITCH, DEFAULTS.voicePitch, 0.7, 1.3),
      ttsEngine: normalizeEngine(env.TTS_ENGINE || DEFAULTS.ttsEngine),
      obsRoute: normalizeRoute(env.OBS_ROUTE || DEFAULTS.obsRoute),
      piperVoiceId: String(env.PIPER_VOICE_ID || DEFAULTS.piperVoiceId).trim(),
      piperRuntimeDir: env.PIPER_RUNTIME_DIR || '',
      piperExecutablePath: env.PIPER_EXECUTABLE_PATH || '',
      piperModelPath: env.PIPER_MODEL_PATH || '',
      piperConfigPath: env.PIPER_CONFIG_PATH || '',
      sileroSpeaker: normalizeSileroSpeaker(env.SILERO_SPEAKER || DEFAULTS.sileroSpeaker),
      sileroPythonPath: env.SILERO_PYTHON_PATH || '',
      sileroScriptPath: env.SILERO_SCRIPT_PATH || '',
      sileroModelCacheDir: env.SILERO_MODEL_CACHE_DIR || ''
    },
    filters: {
      ttsCommand: normalizeCommand(env.TTS_COMMAND || DEFAULTS.ttsCommand),
      ignoredUsers: parseIgnoredUsers(env.IGNORED_USERS)
    }
  };
}

export function getPublicConfig(config) {
  return {
    channel: config.twitch.channel,
    hasTwitchCredentials: config.twitch.hasCredentials,
    readUsernames: config.tts.readUsernames,
    maxMessageLength: config.tts.maxMessageLength,
    minSecondsBetweenMessages: config.tts.minSecondsBetweenMessages,
    voiceVolume: config.tts.voiceVolume,
    voiceRate: config.tts.voiceRate,
    voicePitch: config.tts.voicePitch,
    ttsEngine: config.tts.ttsEngine,
    obsRoute: config.tts.obsRoute,
    obsUrl: `http://localhost:${config.port}${config.tts.obsRoute}`,
    piperVoiceId: config.tts.piperVoiceId,
    sileroSpeaker: config.tts.sileroSpeaker,
    piperModelConfigured: Boolean(config.tts.piperModelPath && config.tts.piperConfigPath),
    ttsCommand: config.filters.ttsCommand,
    ignoredUsers: [...config.filters.ignoredUsers]
  };
}

function normalizeSileroSpeaker(value) {
  const speaker = String(value || DEFAULTS.sileroSpeaker).trim().toLowerCase();
  return ['aidar', 'baya', 'kseniya', 'xenia', 'eugene'].includes(speaker) ? speaker : DEFAULTS.sileroSpeaker;
}

function normalizeChannel(value) {
  return String(value || '')
    .trim()
    .replace(/^#/, '')
    .toLowerCase();
}

function normalizeOAuthToken(value) {
  const token = value?.trim();

  if (!token) {
    return '';
  }

  return token.startsWith('oauth:') ? token : `oauth:${token}`;
}

function isRealTwitchCredential(username, oauthToken) {
  if (!username || !oauthToken) {
    return false;
  }

  const normalizedUsername = username.toLowerCase();
  const normalizedToken = oauthToken.toLowerCase();

  if (normalizedUsername.includes('your_') || normalizedUsername.includes('token')) {
    return false;
  }

  return !normalizedToken.includes('your_token_here');
}

function normalizeCommand(value) {
  const command = String(value || DEFAULTS.ttsCommand).trim().toLowerCase();
  return command.startsWith('!') ? command : `!${command}`;
}

function normalizeEngine(value) {
  const engine = String(value || DEFAULTS.ttsEngine).trim().toLowerCase();
  return ['browser', 'piper', 'silero'].includes(engine) ? engine : DEFAULTS.ttsEngine;
}

function normalizeRoute(value) {
  const route = String(value || DEFAULTS.obsRoute).trim();
  return route.startsWith('/') ? route : `/${route}`;
}

function parseBool(value, fallback) {
  if (value === undefined || value === '') {
    return fallback;
  }

  return ['1', 'true', 'yes', 'y', 'on'].includes(String(value).toLowerCase());
}

function parseNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseRangeNumber(value, fallback, min, max) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, parsed));
}

function parseIgnoredUsers(value) {
  const users = String(value || DEFAULTS.ignoredUsers.join(','))
    .split(',')
    .map((name) => name.trim().toLowerCase())
    .filter(Boolean);

  return new Set(users);
}
