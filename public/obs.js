const statusEl = document.querySelector('#status');
const player = document.querySelector('#player');
const clickHint = document.querySelector('#click-hint');

const state = {
  queue: [],
  speaking: false,
  audioUnlocked: typeof window.obsstudio !== 'undefined',
  minDelayMs: 1200,
  voices: [],
  settings: {
    voiceVolume: 1,
    ttsLanguage: 'en-US'
  }
};

if (!state.audioUnlocked) {
  clickHint.classList.remove('hidden');
}

document.addEventListener('click', () => {
  if (!state.audioUnlocked) {
    state.audioUnlocked = true;
    clickHint.classList.add('hidden');
    player.play().catch(() => {});
    setStatus('audio-unlocked');
    drainQueue();
  }
});

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
  if (state.speaking || state.queue.length === 0 || !state.audioUnlocked) {
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

    const timeout = setTimeout(resolve, 30000);
    const done = () => { clearTimeout(timeout); resolve(); };

    player.onended = done;
    player.onerror = done;
    player.play().catch(done);
  });
}

function speak(text) {
  return new Promise((resolve) => {
    if (!('speechSynthesis' in window)) {
      resolve();
      return;
    }

    if (typeof window.obsstudio !== 'undefined') {
      setStatus('browser-tts-not-supported-in-obs');
      resolve();
      return;
    }

    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    const langCode = (state.settings.ttsLanguage || 'en-US').split('-')[0].toLowerCase();
    const selectedVoice =
      state.voices.find((voice) => voice.lang.toLowerCase().startsWith(langCode)) || state.voices[0];

    if (selectedVoice) {
      utterance.voice = selectedVoice;
      utterance.lang = selectedVoice.lang;
    } else {
      utterance.lang = state.settings.ttsLanguage || 'en-US';
    }

    utterance.volume = Number(state.settings.voiceVolume);

    const timeout = setTimeout(resolve, Math.max(10000, text.length * 80));
    const done = () => { clearTimeout(timeout); resolve(); };

    utterance.onend = done;
    utterance.onerror = done;
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

  if (settings.ttsLanguage !== undefined) {
    state.settings.ttsLanguage = settings.ttsLanguage;
  }

  player.volume = Number(state.settings.voiceVolume);
}

function setStatus(value) {
  statusEl.textContent = value;
}
