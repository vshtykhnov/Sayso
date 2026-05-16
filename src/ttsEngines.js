import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

export const TTS_ENGINES = [
  { id: 'browser', label: 'Browser voice', available: true },
  { id: 'piper', label: 'Piper offline', available: true },
  { id: 'silero', label: 'Silero offline', available: true }
];

const PIPER_VOICES = [
  { id: 'ru_RU-dmitri-medium', label: 'Dmitri' },
  { id: 'ru_RU-irina-medium', label: 'Irina' }
];

const SILERO_SPEAKERS = [
  { id: 'aidar', label: 'Aidar' },
  { id: 'baya', label: 'Baya' },
  { id: 'kseniya', label: 'Kseniya' },
  { id: 'xenia', label: 'Xenia' },
  { id: 'eugene', label: 'Eugene' }
];

export function createTtsEngineRuntime(config, options = {}) {
  const logger = options.logger;
  const audioDir = options.audioDir || path.join(options.userDataDir || process.cwd(), 'audio-cache');
  fs.mkdirSync(audioDir, { recursive: true });

  return {
    audioDir,
    listEngines() {
      return TTS_ENGINES;
    },
    listVoices() {
      return {
        browser: [{ id: 'browser-system', label: 'System browser voices' }],
        piper: getPiperVoices(config),
        silero: SILERO_SPEAKERS
      };
    },
    async enrichMessage(message) {
      if (config.tts.ttsEngine === 'piper') {
        return synthesizePiper(message, config, audioDir, logger);
      }

      if (config.tts.ttsEngine === 'silero') {
        return synthesizeSilero(message, config, audioDir, logger);
      }

      return {
        ...message,
        ttsEngine: 'browser'
      };
    }
  };
}

async function synthesizePiper(message, config, audioDir, logger) {
  const runtimeDir = config.tts.piperRuntimeDir;
  const executable = config.tts.piperExecutablePath || path.join(runtimeDir, 'piper.exe');
  const voicePaths = resolvePiperVoice(config);
  const modelPath = config.tts.piperModelPath || voicePaths.modelPath;
  const configPath = config.tts.piperConfigPath || voicePaths.configPath;

  assertFile(executable, 'piper.exe');
  assertFile(modelPath, 'Piper voice model');
  assertFile(configPath, 'Piper voice config');

  const id = crypto.randomUUID();
  const outputFile = path.join(audioDir, `${id}.wav`);
  const args = [
    '--model',
    modelPath,
    '--config',
    configPath,
    '--output_file',
    outputFile,
    '--length_scale',
    String(rateToLengthScale(config.tts.voiceRate)),
    '--sentence_silence',
    '0.15',
    '--quiet'
  ];

  logger?.info('Generating Piper audio.', {
    id,
    modelPath,
    textLength: message.spokenText.length
  });

  await runPiper(executable, args, message.spokenText);

  return {
    ...message,
    ttsEngine: 'piper',
    audioUrl: `/audio/${id}.wav`
  };
}

async function synthesizeSilero(message, config, audioDir, logger) {
  const pythonPath = config.tts.sileroPythonPath;
  const scriptPath = config.tts.sileroScriptPath;
  const modelCacheDir = config.tts.sileroModelCacheDir;

  assertFile(pythonPath, 'Silero Python runtime');
  assertFile(scriptPath, 'Silero script');

  const id = crypto.randomUUID();
  const outputFile = path.join(audioDir, `${id}.wav`);
  const inputJson = path.join(audioDir, `${id}.json`);
  const payload = {
    text: message.spokenText,
    speaker: config.tts.sileroSpeaker,
    sampleRate: 48000,
    outputFile,
    modelCacheDir
  };

  fs.writeFileSync(inputJson, JSON.stringify(payload), 'utf8');

  logger?.info('Generating Silero audio.', {
    id,
    speaker: config.tts.sileroSpeaker,
    textLength: message.spokenText.length
  });

  await runProcess(pythonPath, [scriptPath, '--input-json', inputJson], message.spokenText);

  return {
    ...message,
    ttsEngine: 'silero',
    audioUrl: `/audio/${id}.wav`
  };
}

function runPiper(executable, args, text) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true
    });

    let stderr = '';

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`Piper exited with code ${code}: ${stderr.trim()}`));
    });

    child.stdin.end(text);
  });
}

function runProcess(executable, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        PYTHONDONTWRITEBYTECODE: '1',
        PYTHONWARNINGS: 'ignore::SyntaxWarning'
      },
      windowsHide: true
    });

    let stderr = '';

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`${path.basename(executable)} exited with code ${code}: ${stderr.trim()}`));
    });
  });
}

function getPiperVoices(config) {
  return PIPER_VOICES.map((voice) => {
    const paths = resolvePiperVoice({ tts: { ...config.tts, piperVoiceId: voice.id } });
    return {
      ...voice,
      ...paths,
      available: fs.existsSync(paths.modelPath) && fs.existsSync(paths.configPath)
    };
  });
}

function resolvePiperVoice(config) {
  const voiceId = config.tts.piperVoiceId || 'ru_RU-dmitri-medium';
  const voicesDir = path.join(config.tts.piperRuntimeDir, 'voices');
  return {
    modelPath: path.join(voicesDir, `${voiceId}.onnx`),
    configPath: path.join(voicesDir, `${voiceId}.onnx.json`)
  };
}

function assertFile(filePath, label) {
  if (!filePath || !fs.existsSync(filePath)) {
    throw new Error(`${label} not found: ${filePath || 'not configured'}`);
  }
}

function rateToLengthScale(rate) {
  const normalized = Number(rate) || 1;
  return Math.min(1.5, Math.max(0.65, 1 / normalized));
}
