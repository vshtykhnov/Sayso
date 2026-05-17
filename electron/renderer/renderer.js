const fields = {
  twitchChannel: document.querySelector('#twitchChannel'),
  twitchClientId: document.querySelector('#twitchClientId'),
  twitchUsername: document.querySelector('#twitchUsername'),
  twitchOAuthToken: document.querySelector('#twitchOAuthToken'),
  port: document.querySelector('#port'),
  readUsernames: document.querySelector('#usernameConnector'),
  ttsEngine: document.querySelector('#ttsEngine'),
  ttsLanguage: document.querySelector('#ttsLanguage'),
  ttsCommand: document.querySelector('#ttsCommand'),
  maxMessageLength: document.querySelector('#maxMessageLength'),
  minSecondsBetweenMessages: document.querySelector('#minSecondsBetweenMessages'),
  voiceVolume: document.querySelector('#voiceVolume'),
  piperVoiceId: document.querySelector('#piperVoiceId'),
  sileroSpeaker: document.querySelector('#sileroSpeaker'),
  ignoredUsers: document.querySelector('#ignoredUsers')
};

const statusEl = document.querySelector('#status');
const obsUrlEl = document.querySelector('#obs-url');
const logEl = document.querySelector('#log');
const startButton = document.querySelector('#start');
const stopButton = document.querySelector('#stop');
const copyButton = document.querySelector('#copy-url');
const openButton = document.querySelector('#open-url');
const testButton = document.querySelector('#test');
const loginTwitchButton = document.querySelector('#login-twitch');
const validateTokenButton = document.querySelector('#validate-token');
const logPathEl = document.querySelector('#log-path');
const copyLogPathButton = document.querySelector('#copy-log-path');
const openLogsButton = document.querySelector('#open-logs');
const voiceVolumeValueEl = document.querySelector('#voiceVolumeValue');

let currentUrl = 'http://localhost:3000';

const initial = await window.miljenTts.loadSettings();
fillForm(initial.settings);
renderVoiceValues();
setServerState(initial.server);
logPathEl.textContent = initial.logPath;
appendLog(`Settings file: ${initial.configPath}`);
appendLog(`Log file: ${initial.logPath}`);

window.miljenTts.onServerStatus((event) => {
  appendLog(event.message || event.status);

  if (event.status === 'server-started') {
    setStatus(`Server running: ${event.url}`, 'ok');
  } else if (event.status === 'twitch-connected') {
    setStatus('Twitch connected. OBS source is ready.', 'ok');
  } else if (event.status === 'missing-token') {
    setStatus('Server running in test mode. Use Login with Twitch or Manual OAuth token to read chat.', 'warning');
  } else if (event.status === 'twitch-error') {
    setStatus(event.message || 'Twitch connection error.', 'error');
  }
});

startButton.addEventListener('click', async () => {
  try {
    setStatus('Starting server...', 'pending');
    const server = await window.miljenTts.startServer(readForm());
    setServerState(server);
    setStatus(`Server running: ${server.url}`, 'ok');
  } catch (error) {
    setStatus(error.message || String(error), 'error');
  }
});

stopButton.addEventListener('click', async () => {
  const server = await window.miljenTts.stopServer();
  setServerState(server);
  setStatus('Server stopped.', 'pending');
});

copyButton.addEventListener('click', async () => {
  await window.miljenTts.copyText(currentUrl);
  appendLog(`Copied OBS URL: ${currentUrl}`);
});

openButton.addEventListener('click', () => {
  window.miljenTts.openExternal(currentUrl);
});

copyLogPathButton.addEventListener('click', async () => {
  await window.miljenTts.copyText(logPathEl.textContent);
  appendLog(`Copied log path: ${logPathEl.textContent}`);
});

openLogsButton.addEventListener('click', () => {
  window.miljenTts.openLogs();
});

testButton.addEventListener('click', async () => {
  try {
    const settings = readForm();
    await window.miljenTts.saveSettings(settings);
    await window.miljenTts.updateTtsSettings(settings);
    await window.miljenTts.testVoice(readForm());
    appendLog('Test message sent to OBS page.');
  } catch (error) {
    setStatus(error.message || 'Start server before sending a test message.', 'warning');
  }
});

loginTwitchButton.addEventListener('click', async () => {
  try {
    setStatus('Opening Twitch login...', 'pending');
    const settings = await window.miljenTts.loginWithTwitch(readForm());
    fillForm(settings);
    setStatus(`Twitch login saved for ${settings.twitchUsername}.`, 'ok');
    appendLog(`Twitch login saved for ${settings.twitchUsername}.`);
  } catch (error) {
    setStatus(error.message || String(error), 'error');
  }
});

validateTokenButton.addEventListener('click', async () => {
  try {
    const result = await window.miljenTts.validateTwitchToken(readForm());
    fields.twitchUsername.value = result.login || fields.twitchUsername.value;
    await window.miljenTts.saveSettings(readForm());
    appendLog(`Token valid for ${result.login}.`);
    setStatus(`Token valid for ${result.login}.`, 'ok');
  } catch (error) {
    setStatus(error.message || String(error), 'error');
  }
});

for (const input of Object.values(fields)) {
  input.addEventListener('change', () => {
    window.miljenTts.saveSettings(readForm()).catch(() => {
      setStatus('Could not save settings.', 'error');
    });
  });
}

for (const input of [fields.voiceVolume]) {
  input.addEventListener('input', async () => {
    renderVoiceValues();
    const settings = readForm();
    await window.miljenTts.saveSettings(settings);
    await window.miljenTts.updateTtsSettings(settings);
  });
}

function syncLanguageToEngine() {
  const engine = fields.ttsEngine.value;
  if (engine === 'piper' || engine === 'silero') {
    fields.ttsLanguage.value = 'ru-RU';
    fields.ttsLanguage.disabled = true;
  } else {
    fields.ttsLanguage.disabled = false;
  }
}

for (const input of [fields.ttsEngine, fields.ttsLanguage, fields.piperVoiceId, fields.sileroSpeaker]) {
  input.addEventListener('change', async () => {
    if (input === fields.ttsEngine) syncLanguageToEngine();
    const settings = readForm();
    await window.miljenTts.saveSettings(settings);
    await window.miljenTts.updateTtsSettings(settings);
  });
}

function fillForm(settings) {
  fields.twitchChannel.value = settings.twitchChannel || '';
  fields.twitchClientId.value = settings.twitchClientId || '';
  fields.twitchUsername.value = settings.twitchUsername || '';
  fields.twitchOAuthToken.value = settings.twitchOAuthToken || '';
  fields.port.value = settings.port || 3000;
  fields.readUsernames.value = settings.usernameConnector ?? '';
  fields.ttsEngine.value = settings.ttsEngine || 'browser';
  fields.ttsLanguage.value = settings.ttsLanguage || 'en-US';
  fields.ttsCommand.value = settings.ttsCommand || '!tts';
  fields.maxMessageLength.value = settings.maxMessageLength || 220;
  fields.minSecondsBetweenMessages.value = settings.minSecondsBetweenMessages || 1.2;
  fields.voiceVolume.value = settings.voiceVolume ?? 1;
  fields.piperVoiceId.value = settings.piperVoiceId || 'ru_RU-dmitri-medium';
  fields.sileroSpeaker.value = settings.sileroSpeaker || 'xenia';
  fields.ignoredUsers.value = settings.ignoredUsers || 'nightbot,streamelements';
  syncLanguageToEngine();
}

function readForm() {
  return {
    twitchChannel: fields.twitchChannel.value,
    twitchClientId: fields.twitchClientId.value,
    twitchUsername: fields.twitchUsername.value,
    twitchOAuthToken: fields.twitchOAuthToken.value,
    port: Number(fields.port.value),
    usernameConnector: fields.readUsernames.value,
    ttsEngine: fields.ttsEngine.value,
    ttsLanguage: fields.ttsLanguage.value,
    ttsCommand: fields.ttsCommand.value,
    maxMessageLength: Number(fields.maxMessageLength.value),
    minSecondsBetweenMessages: Number(fields.minSecondsBetweenMessages.value),
    voiceVolume: Number(fields.voiceVolume.value),
    piperVoiceId: fields.piperVoiceId.value,
    sileroSpeaker: fields.sileroSpeaker.value,
    ignoredUsers: fields.ignoredUsers.value
  };
}

function renderVoiceValues() {
  voiceVolumeValueEl.textContent = `${Math.round(Number(fields.voiceVolume.value) * 100)}%`;
}

function setServerState(server) {
  currentUrl = server.url;
  obsUrlEl.textContent = server.url;
  startButton.disabled = server.running;
  stopButton.disabled = !server.running;
  testButton.disabled = !server.running;
}

function setStatus(text, mode) {
  statusEl.textContent = text;
  statusEl.dataset.mode = mode;
}

function appendLog(text) {
  const item = document.createElement('li');
  item.textContent = `[${new Date().toLocaleTimeString()}] ${text}`;
  logEl.prepend(item);

  while (logEl.children.length > 40) {
    logEl.lastElementChild.remove();
  }
}
