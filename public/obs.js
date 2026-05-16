const statusEl = document.querySelector('#status');
const player = document.querySelector('#player');

const state = {
  queue: [],
  speaking: false,
  minDelayMs: 1200,
  voices: [],
  settings: {
    voiceVolume: 1,
    voiceRate: 1,
    voicePitch: 1
  }
};

await loadConfig();
setupVoices();
connect();

async function loadConfig() {
  try {
    const response = await fetch('/api/config');
    const config = await response.json();
    state.minDelayMs = Number(config.minSecondsBetweenMessages || 1.2) * 1000;
    applySettings(config);
    setStatus(`ready:${config.ttsEngine}`);
  } catch {
    setStatus('config-error');
  }
}

function connect() {
  const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
  const socket = new WebSocket(`${protocol}://${location.host}/ws`);

  socket.addEventListener('open', () => {
    setStatus('ws-open');
  });

  socket.addEventListener('message', (event) => {
    const payload = JSON.parse(event.data);

    if (payload.type === 'tts-settings') {
      applySettings(payload.settings);
      return;
    }

    if (payload.type === 'message') {
      state.queue.push(payload);
      drainQueue();
      return;
    }

    if (payload.type === 'status') {
      setStatus(payload.status);
    }
  });

  socket.addEventListener('close', () => {
    setStatus('ws-closed');
    setTimeout(connect, 2000);
  });
}

async function drainQueue() {
  if (state.speaking || state.queue.length === 0) {
    return;
  }

  const message = state.queue.shift();
  state.speaking = true;

  try {
    if (message.audioUrl) {
      await playAudio(message.audioUrl);
    } else {
      await speak(message.spokenText);
    }
  } finally {
    setTimeout(() => {
      state.speaking = false;
      drainQueue();
    }, state.minDelayMs);
  }
}

function playAudio(url) {
  return new Promise((resolve) => {
    player.pause();
    player.currentTime = 0;
    player.src = url;
    player.volume = Number(state.settings.voiceVolume);
    player.onended = resolve;
    player.onerror = resolve;
    player.play().catch(resolve);
  });
}

function speak(text) {
  return new Promise((resolve) => {
    if (!('speechSynthesis' in window)) {
      resolve();
      return;
    }

    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    const selectedVoice =
      state.voices.find((voice) => voice.lang.toLowerCase().startsWith('ru')) || state.voices[0];

    if (selectedVoice) {
      utterance.voice = selectedVoice;
      utterance.lang = selectedVoice.lang;
    } else {
      utterance.lang = 'ru-RU';
    }

    utterance.volume = Number(state.settings.voiceVolume);
    utterance.rate = Number(state.settings.voiceRate);
    utterance.pitch = Number(state.settings.voicePitch);
    utterance.onend = resolve;
    utterance.onerror = resolve;
    window.speechSynthesis.speak(utterance);
  });
}

function setupVoices() {
  const populate = () => {
    state.voices = window.speechSynthesis?.getVoices?.() || [];
  };

  populate();

  if ('speechSynthesis' in window) {
    window.speechSynthesis.onvoiceschanged = populate;
  }
}

function applySettings(settings) {
  if (settings.voiceVolume !== undefined) {
    state.settings.voiceVolume = settings.voiceVolume;
  }

  if (settings.voiceRate !== undefined) {
    state.settings.voiceRate = settings.voiceRate;
  }

  if (settings.voicePitch !== undefined) {
    state.settings.voicePitch = settings.voicePitch;
  }

  player.volume = Number(state.settings.voiceVolume);
}

function setStatus(value) {
  statusEl.textContent = value;
}
