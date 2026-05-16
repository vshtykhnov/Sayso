const statusEl = document.querySelector('#status');
const currentEl = document.querySelector('#current');
const logEl = document.querySelector('#log');
const toggleButton = document.querySelector('#toggle');
const testButton = document.querySelector('#test');
const clearButton = document.querySelector('#clear');
const voiceSelect = document.querySelector('#voice');
const volumeInput = document.querySelector('#volume');
const rateInput = document.querySelector('#rate');
const pitchInput = document.querySelector('#pitch');
const player = document.querySelector('#player');
const volumeValueEl = document.querySelector('#volume-value');
const rateValueEl = document.querySelector('#rate-value');
const pitchValueEl = document.querySelector('#pitch-value');
const obsUrlEl = document.querySelector('#obs-url');
const ttsCommandEl = document.querySelector('#tts-command');

const state = {
  paused: false,
  speaking: false,
  queue: [],
  minDelayMs: 1200,
  voices: [],
  socket: null
};

const savedSettings = loadSettings();
voiceSelect.value = savedSettings.voice || '';
obsUrlEl.textContent = `${location.origin}/obs`;
renderTtsSettingValues();

await loadConfig();
setupVoices();
connect();

toggleButton.addEventListener('click', () => {
  state.paused = !state.paused;
  toggleButton.textContent = state.paused ? 'Продолжить' : 'Пауза';

  if (!state.paused) {
    drainQueue();
  }
});

testButton.addEventListener('click', async () => {
  try {
    await fetch('/api/test-message', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: 'Проверка озвучки. Если вы слышите этот текст, MiljenTTS работает.' })
    });
  } catch {
    enqueue({
      type: 'message',
      username: 'Test',
      text: 'Проверка озвучки. Если вы слышите этот текст, MiljenTTS работает.',
      spokenText: 'Проверка озвучки. Если вы слышите этот текст, MiljenTTS работает.',
      ts: Date.now()
    });
  }
});

clearButton.addEventListener('click', () => {
  window.speechSynthesis?.cancel?.();
  player.pause();
  player.removeAttribute('src');
  state.queue = [];
  state.speaking = false;
  currentEl.textContent = 'очередь очищена';
  logEl.replaceChildren();
});

voiceSelect.addEventListener('change', saveSettings);

for (const input of [volumeInput, rateInput, pitchInput]) {
  input.addEventListener('input', () => {
    renderTtsSettingValues();
    if (player) {
      player.volume = Number(volumeInput.value);
    }
  });
}

async function loadConfig() {
  try {
    const response = await fetch('/api/config');
    const config = await response.json();
    state.minDelayMs = Number(config.minSecondsBetweenMessages || 1.2) * 1000;
    ttsCommandEl.textContent = `${config.ttsCommand || '!tts'} текст сообщения`;
    applyTtsSettings(config);

    if (config.hasTwitchCredentials) {
      setStatus(`Канал #${config.channel}. Жду Twitch...`, 'pending');
    } else {
      setStatus(`Канал #${config.channel}. Нет Twitch OAuth токена, работает только тест.`, 'warning');
    }
  } catch {
    setStatus('Не удалось загрузить настройки сервера', 'error');
  }
}

function connect() {
  const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
  const socket = new WebSocket(`${protocol}://${location.host}/ws`);
  state.socket = socket;

  socket.addEventListener('open', () => {
    setStatus('Debug-страница подключена к локальному серверу', 'pending');
  });

  socket.addEventListener('message', (event) => {
    const payload = JSON.parse(event.data);

    if (payload.type === 'status') {
      renderStatus(payload);
      return;
    }

    if (payload.type === 'tts-settings') {
      applyTtsSettings(payload.settings);
      return;
    }

    if (payload.type === 'message') {
      enqueue(payload);
    }
  });

  socket.addEventListener('close', () => {
    setStatus('Соединение потеряно, переподключаюсь...', 'warning');
    setTimeout(connect, 2000);
  });

  socket.addEventListener('error', () => {
    setStatus('Ошибка WebSocket соединения', 'error');
  });
}

function enqueue(message) {
  state.queue.push(message);
  renderMessage(message);
  drainQueue();
}

async function drainQueue() {
  if (state.paused || state.speaking || state.queue.length === 0) {
    return;
  }

  const message = state.queue.shift();
  state.speaking = true;
  currentEl.textContent = `${message.username}: ${message.text}`;

  try {
    if (message.audioUrl) {
      await playAudio(message.audioUrl);
    } else {
      await speak(message.spokenText);
    }
  } finally {
    setTimeout(() => {
      state.speaking = false;
      currentEl.textContent = state.queue.length > 0 ? 'следующее сообщение...' : 'ожидаю сообщения';
      drainQueue();
    }, state.minDelayMs);
  }
}

function playAudio(url) {
  return new Promise((resolve) => {
    window.speechSynthesis?.cancel?.();
    player.pause();
    player.currentTime = 0;
    player.src = url;
    player.volume = Number(volumeInput.value);
    player.onended = resolve;
    player.onerror = resolve;
    player.play().catch(resolve);
  });
}

function speak(text) {
  return new Promise((resolve) => {
    if (!('speechSynthesis' in window)) {
      console.warn('speechSynthesis is not available in this browser.');
      resolve();
      return;
    }

    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    const selectedVoice = state.voices.find((voice) => voice.name === voiceSelect.value);

    if (selectedVoice) {
      utterance.voice = selectedVoice;
      utterance.lang = selectedVoice.lang;
    } else {
      utterance.lang = 'ru-RU';
    }

    utterance.volume = Number(volumeInput.value);
    utterance.rate = Number(rateInput.value);
    utterance.pitch = Number(pitchInput.value);
    utterance.onend = resolve;
    utterance.onerror = resolve;

    window.speechSynthesis.speak(utterance);
  });
}

function setupVoices() {
  const populate = () => {
    const voices = window.speechSynthesis?.getVoices?.() || [];
    state.voices = voices;
    voiceSelect.replaceChildren();

    if (voices.length === 0) {
      const option = document.createElement('option');
      option.textContent = 'Голоса не найдены';
      voiceSelect.append(option);
      return;
    }

    for (const voice of voices) {
      const option = document.createElement('option');
      option.value = voice.name;
      option.textContent = `${voice.name} (${voice.lang})`;
      voiceSelect.append(option);
    }

    const preferred =
      savedSettings.voice ||
      voices.find((voice) => voice.lang.toLowerCase().startsWith('ru'))?.name ||
      voices[0]?.name;

    if (preferred) {
      voiceSelect.value = preferred;
    }
  };

  populate();

  if ('speechSynthesis' in window) {
    window.speechSynthesis.onvoiceschanged = populate;
  }
}

function renderMessage(message) {
  const item = document.createElement('li');
  const user = document.createElement('span');
  const text = document.createElement('p');

  user.textContent = message.isTest ? `${message.username} · тест` : message.username;
  text.textContent = message.text;
  item.append(user, text);
  logEl.prepend(item);

  while (logEl.children.length > 12) {
    logEl.lastElementChild.remove();
  }
}

function renderStatus(payload) {
  if (payload.status === 'twitch-connected') {
    setStatus(`Twitch подключен: #${payload.channel}`, 'ok');
  } else if (payload.status === 'twitch-disconnected') {
    setStatus(`Twitch отключен: ${payload.reason || 'нет причины'}`, 'warning');
  } else if (payload.status === 'twitch-error') {
    setStatus(`Ошибка Twitch: ${payload.reason || 'проверьте OAuth токен'}`, 'error');
  } else if (payload.status === 'missing-token') {
    setStatus('Нет Twitch OAuth токена. Тестовая озвучка доступна.', 'warning');
  }
}

function applyTtsSettings(settings) {
  if (settings.voiceVolume !== undefined) {
    volumeInput.value = settings.voiceVolume;
  }

  if (settings.voiceRate !== undefined) {
    rateInput.value = settings.voiceRate;
  }

  if (settings.voicePitch !== undefined) {
    pitchInput.value = settings.voicePitch;
  }

  if (player) {
    player.volume = Number(volumeInput.value);
  }

  renderTtsSettingValues();
}

function setStatus(text, mode) {
  statusEl.textContent = text;
  statusEl.dataset.mode = mode;
}

function saveSettings() {
  localStorage.setItem(
    'tts-settings',
    JSON.stringify({
      voice: voiceSelect.value
    })
  );
}

function renderTtsSettingValues() {
  volumeValueEl.textContent = `${Math.round(Number(volumeInput.value) * 100)}%`;
  rateValueEl.textContent = `${Number(rateInput.value).toFixed(2)}x`;
  pitchValueEl.textContent = Number(pitchInput.value).toFixed(2);
}

function loadSettings() {
  try {
    return JSON.parse(localStorage.getItem('tts-settings')) || {};
  } catch {
    return {};
  }
}
