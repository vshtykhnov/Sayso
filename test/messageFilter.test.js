import test from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from '../src/config.js';
import { extractTtsCommandText, prepareChatMessage, sanitizeMessage } from '../src/messageFilter.js';

test('sanitizeMessage replaces links and limits length', () => {
  const text = sanitizeMessage('hello https://example.com very long text', 18);

  assert.equal(text, 'hello ссылка very');
});

test('extractTtsCommandText returns only text after !tts', () => {
  assert.equal(extractTtsCommandText('!tts привет чат', '!tts'), 'привет чат');
  assert.equal(extractTtsCommandText('!TTS Привет', '!tts'), 'Привет');
  assert.equal(extractTtsCommandText('обычное сообщение', '!tts'), '');
});

test('prepareChatMessage ignores normal chat messages', () => {
  const config = loadConfig({
    TWITCH_CHANNEL: 'channel'
  });

  const payload = prepareChatMessage('hello chat', { username: 'viewer' }, '#channel', config);

  assert.equal(payload, null);
});

test('prepareChatMessage ignores other commands', () => {
  const config = loadConfig({
    TWITCH_CHANNEL: 'channel'
  });

  const payload = prepareChatMessage('!uptime', { username: 'viewer' }, '#channel', config);

  assert.equal(payload, null);
});

test('prepareChatMessage ignores empty !tts command', () => {
  const config = loadConfig({
    TWITCH_CHANNEL: 'channel'
  });

  const payload = prepareChatMessage('!tts', { username: 'viewer' }, '#channel', config);

  assert.equal(payload, null);
});

test('prepareChatMessage ignores configured bots', () => {
  const config = loadConfig({
    TWITCH_CHANNEL: 'channel',
    IGNORED_USERS: 'nightbot'
  });

  const payload = prepareChatMessage('!tts hello', { username: 'nightbot' }, '#channel', config);

  assert.equal(payload, null);
});

test('prepareChatMessage builds spoken text from command body with username', () => {
  const config = loadConfig({
    TWITCH_CHANNEL: 'channel',
    READ_USERNAMES: 'true'
  });

  const payload = prepareChatMessage(
    '!tts привет чат',
    { username: 'viewer', 'display-name': 'Viewer' },
    '#channel',
    config
  );

  assert.equal(payload.username, 'Viewer');
  assert.equal(payload.text, 'привет чат');
  assert.equal(payload.spokenText, 'Viewer: привет чат');
});
