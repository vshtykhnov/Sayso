export function prepareChatMessage(rawMessage, userstate, messageChannel, config) {
  const username = userstate['display-name'] || userstate.username || 'chat';
  const login = String(userstate.username || username).toLowerCase();
  const commandText = extractTtsCommandText(rawMessage, config.filters.ttsCommand);

  if (!shouldRead(login, commandText, config)) {
    return null;
  }

  const text = sanitizeMessage(commandText, config.tts.maxMessageLength);

  if (!text) {
    return null;
  }

  return createMessagePayload({
    id: userstate.id,
    channel: messageChannel,
    username,
    text,
    usernameConnector: config.tts.usernameConnector
  });
}

const TEST_MESSAGES = {
  ru: 'Проверка голоса. Если слышишь это — MiljenTTS работает.',
  en: 'Voice check. If you hear this, MiljenTTS is working.',
  de: 'Sprachtest. Wenn du das hörst, funktioniert MiljenTTS.',
  fr: 'Test vocal. Si tu entends ceci, MiljenTTS fonctionne.',
  es: 'Prueba de voz. Si escuchas esto, MiljenTTS funciona.',
  pt: 'Teste de voz. Se você ouvir isso, MiljenTTS está funcionando.',
  it: 'Test voce. Se senti questo, MiljenTTS funziona.',
  pl: 'Test głosu. Jeśli to słyszysz, MiljenTTS działa.',
  ja: 'ボイスチェック。これが聞こえたら、MiljenTTSは動作しています。',
  ko: '음성 확인. 이 소리가 들리면 MiljenTTS가 작동 중입니다.',
  zh: '语音检查。如果您听到这个，MiljenTTS正在运行。'
};

export function createTestMessage(config, text, username = 'Test') {
  const langCode = (config.tts?.ttsLanguage || 'en-US').split('-')[0].toLowerCase();
  const defaultText = TEST_MESSAGES[langCode] || TEST_MESSAGES.en;
  const cleanText = sanitizeMessage(text || defaultText, config.tts.maxMessageLength);

  return createMessagePayload({
    id: `test-${Date.now()}`,
    channel: config.twitch.channel || 'local',
    username,
    text: cleanText,
    usernameConnector: config.tts.usernameConnector,
    isTest: true
  });
}

export function sanitizeMessage(message, maxLength) {
  return String(message || '')
    .replace(/https?:\/\/\S+/gi, ' ссылка ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength)
    .trim();
}

export function extractTtsCommandText(message, command) {
  const raw = String(message || '').trim();
  const expectedCommand = String(command || '!tts').toLowerCase();
  const [firstToken, ...rest] = raw.split(/\s+/);

  if (firstToken?.toLowerCase() !== expectedCommand) {
    return '';
  }

  return rest.join(' ').trim();
}

function shouldRead(username, commandText, config) {
  if (!commandText) {
    return false;
  }

  if (config.filters.ignoredUsers.has(username)) {
    return false;
  }

  return true;
}

function createMessagePayload({ id, channel, username, text, usernameConnector, isTest = false }) {
  const spoken = usernameConnector
    ? `${username} ${usernameConnector} ${text}`
    : text;

  return {
    type: 'message',
    id: id || `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    channel: String(channel || '').replace(/^#/, ''),
    username,
    text,
    spokenText: spoken,
    isTest,
    ts: Date.now()
  };
}
