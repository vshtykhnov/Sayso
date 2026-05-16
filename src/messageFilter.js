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
    readUsernames: config.tts.readUsernames
  });
}

export function createTestMessage(config, text = 'Проверка озвучки MiljenTTS', username = 'Test') {
  const cleanText = sanitizeMessage(text, config.tts.maxMessageLength);

  return createMessagePayload({
    id: `test-${Date.now()}`,
    channel: config.twitch.channel || 'local',
    username,
    text: cleanText,
    readUsernames: config.tts.readUsernames,
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

function createMessagePayload({ id, channel, username, text, readUsernames, isTest = false }) {
  return {
    type: 'message',
    id: id || `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    channel: String(channel || '').replace(/^#/, ''),
    username,
    text,
    spokenText: readUsernames ? `${username}: ${text}` : text,
    isTest,
    ts: Date.now()
  };
}
