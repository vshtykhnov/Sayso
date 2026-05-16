import { app, BrowserWindow, clipboard, ipcMain, shell } from 'electron';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createConfigStore } from '../src/appConfigStore.js';
import { createLogger } from '../src/logger.js';
import { createTtsEngineRuntime } from '../src/ttsEngines.js';
import { createTtsServer } from '../src/ttsServer.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow = null;
let configStore = null;
let logger = null;
let ttsServer = null;
let removeStatusListener = null;

app.setName('MiljenTTS');

if (!app.requestSingleInstanceLock()) {
  app.quit();
}

app.on('second-instance', () => {
  if (!mainWindow) {
    return;
  }

  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }

  mainWindow.focus();
});

app.whenReady().then(() => {
  configStore = createConfigStore(app.getPath('userData'));
  logger = createLogger(app.getPath('userData'));
  logger.info('Application started.', {
    version: app.getVersion(),
    userData: app.getPath('userData')
  });
  registerIpc();
  createWindow();
});

app.on('window-all-closed', async () => {
  logger?.info('Application closing.');
  await stopServer();
  app.quit();
});

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1040,
    height: 900,
    minWidth: 820,
    minHeight: 720,
    title: 'MiljenTTS',
    backgroundColor: '#101116',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

function registerIpc() {
  ipcMain.handle('settings:load', () => {
    const settings = withPiperDefaults(configStore.load());

    return {
      settings,
      configPath: configStore.filePath,
      logPath: logger.logPath,
      server: getServerState(settings)
    };
  });

  ipcMain.handle('settings:save', (_event, settings) => {
    return configStore.save(withPiperDefaults(settings));
  });

  ipcMain.handle('server:start', async (_event, settings) => {
    const savedSettings = configStore.save(withPiperDefaults(settings));
    logger.info('Settings saved before server start.', {
      channel: savedSettings.twitchChannel,
      username: savedSettings.twitchUsername,
      port: savedSettings.port,
      ttsCommand: savedSettings.ttsCommand,
      ttsEngine: savedSettings.ttsEngine,
      hasOAuthToken: Boolean(savedSettings.twitchOAuthToken)
    });
    await startServer(savedSettings);
    return getServerState(savedSettings);
  });

  ipcMain.handle('server:stop', async () => {
    logger.info('Stop requested from UI.');
    await stopServer();
    return getServerState();
  });

  ipcMain.handle('server:testMessage', async () => {
    logger.info('Test message requested from UI.');
    return sendTestMessage();
  });

  ipcMain.handle('server:updateTtsSettings', async (_event, settings) => {
    if (!ttsServer) {
      return { ok: false, reason: 'server-not-running' };
    }

    logger.info('TTS playback settings requested from UI.', {
      voiceVolume: settings.voiceVolume,
      voiceRate: settings.voiceRate,
      voicePitch: settings.voicePitch,
      ttsEngine: settings.ttsEngine,
      piperVoiceId: settings.piperVoiceId
    });

    const response = await fetch(`${getServerBaseUrl()}/api/tts-settings`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        voiceVolume: settings.voiceVolume,
        voiceRate: settings.voiceRate,
        voicePitch: settings.voicePitch,
        ttsEngine: settings.ttsEngine,
        piperVoiceId: settings.piperVoiceId,
        sileroSpeaker: settings.sileroSpeaker
      })
    });

    return response.json();
  });

  ipcMain.handle('twitch:login', async (_event, settings) => {
    const clientId = String(settings?.twitchClientId || '').trim();

    if (!clientId) {
      throw new Error('Enter Twitch Client ID first.');
    }

    const tokenInfo = await loginWithTwitch(clientId);
    const savedSettings = configStore.save(
      withPiperDefaults({
        ...configStore.load(),
        ...settings,
        twitchClientId: clientId,
        twitchUsername: tokenInfo.login,
        twitchOAuthToken: tokenInfo.accessToken
      })
    );

    logger.info('Twitch login completed.', {
      login: tokenInfo.login,
      scopes: tokenInfo.scopes
    });

    return savedSettings;
  });

  ipcMain.handle('twitch:validateToken', async (_event, settings) => {
    const token = String(settings?.twitchOAuthToken || '').replace(/^oauth:/, '').trim();

    if (!token) {
      throw new Error('OAuth token is empty.');
    }

    return validateTwitchToken(token);
  });

  ipcMain.handle('tts:listEngines', () => {
    const runtime = createTtsEngineRuntime(configStore.toRuntimeConfig(withPiperDefaults(configStore.load())), {
      logger,
      userDataDir: app.getPath('userData')
    });
    return runtime.listEngines();
  });

  ipcMain.handle('tts:listVoices', (_event, settings) => {
    const runtime = createTtsEngineRuntime(configStore.toRuntimeConfig(withPiperDefaults(settings || configStore.load())), {
      logger,
      userDataDir: app.getPath('userData')
    });
    return runtime.listVoices();
  });

  ipcMain.handle('tts:testVoice', async (_event, settings) => {
    if (!ttsServer) {
      throw new Error('Start server before testing voice.');
    }

    await configStore.save(withPiperDefaults(settings || configStore.load()));
    return sendTestMessage();
  });

  ipcMain.handle('clipboard:writeText', (_event, text) => {
    clipboard.writeText(String(text || ''));
    return true;
  });

  ipcMain.handle('external:open', (_event, url) => {
    shell.openExternal(url);
    return true;
  });

  ipcMain.handle('logs:open', () => {
    shell.showItemInFolder(logger.logPath);
    return true;
  });
}

async function startServer(settings) {
  await stopServer();

  const runtimeConfig = configStore.toRuntimeConfig(withPiperDefaults(settings));
  runtimeConfig.tts.piperRuntimeDir = getPiperRuntimeDir();
  runtimeConfig.tts.piperExecutablePath ||= getPiperExecutablePath();
  runtimeConfig.tts.piperModelPath = '';
  runtimeConfig.tts.piperConfigPath = '';
  runtimeConfig.tts.sileroPythonPath ||= getSileroPythonPath();
  runtimeConfig.tts.sileroScriptPath ||= getSileroScriptPath();
  runtimeConfig.tts.sileroModelCacheDir ||= getSileroModelCacheDir();

  if (!runtimeConfig.twitch.channel) {
    logger.warn('Server start rejected: missing Twitch channel.');
    throw new Error('Введите Twitch channel перед запуском.');
  }

  ttsServer = createTtsServer(runtimeConfig, {
    logger,
    userDataDir: app.getPath('userData')
  });
  removeStatusListener = ttsServer.onStatus((event) => {
    logger.info('Server status event.', event);
    mainWindow?.webContents.send('server:status', event);
  });

  await ttsServer.start();
}

async function stopServer() {
  if (removeStatusListener) {
    removeStatusListener();
    removeStatusListener = null;
  }

  if (ttsServer) {
    await ttsServer.stop();
    ttsServer = null;
  }
}

function getServerState(settings = configStore?.load()) {
  const port = settings?.port || 3000;
  const obsRoute = settings?.obsRoute || '/obs';

  return {
    running: Boolean(ttsServer),
    url: `http://localhost:${port}${obsRoute}`,
    debugUrl: `http://localhost:${port}/debug`
  };
}

function getServerBaseUrl() {
  const settings = getServerState();
  return settings.url.replace(/\/obs$/, '');
}

async function sendTestMessage() {
  const response = await fetch(`${getServerBaseUrl()}/api/test-message`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text: 'Проверка озвучки. Если вы слышите этот текст, MiljenTTS работает.' })
  });

  const result = await response.json();

  if (!response.ok || result.ok === false) {
    throw new Error(result.reason || `Test message failed: ${response.status}`);
  }

  return result;
}

async function loginWithTwitch(clientId) {
  const redirectUri = 'http://localhost:3000';
  const state = crypto.randomBytes(16).toString('hex');
  const authUrl = new URL('https://id.twitch.tv/oauth2/authorize');
  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('response_type', 'token');
  authUrl.searchParams.set('scope', 'chat:read');
  authUrl.searchParams.set('state', state);

  return new Promise((resolve, reject) => {
    const authWindow = new BrowserWindow({
      width: 720,
      height: 780,
      title: 'Login with Twitch',
      parent: mainWindow,
      modal: true,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true
      }
    });

    const timeout = setTimeout(() => {
      authWindow.destroy();
      reject(new Error('Twitch login timed out.'));
    }, 180000);

    const finish = async (url) => {
      const parsed = parseTwitchTokenRedirect(url);

      if (!parsed) {
        return false;
      }

      clearTimeout(timeout);
      authWindow.destroy();

      if (parsed.state !== state) {
        reject(new Error('Twitch login state mismatch.'));
        return true;
      }

      try {
        const validation = await validateTwitchToken(parsed.accessToken);
        resolve({
          accessToken: parsed.accessToken,
          login: validation.login,
          scopes: validation.scopes || validation.scope || []
        });
      } catch (error) {
        reject(error);
      }

      return true;
    };

    authWindow.webContents.on('will-redirect', (event, url) => {
      if (url.startsWith(redirectUri)) {
        event.preventDefault();
        finish(url);
      }
    });

    authWindow.webContents.on('will-navigate', (event, url) => {
      if (url.startsWith(redirectUri)) {
        event.preventDefault();
        finish(url);
      }
    });

    authWindow.on('closed', () => {
      clearTimeout(timeout);
    });

    authWindow.loadURL(authUrl.toString());
  });
}

async function validateTwitchToken(token) {
  const response = await fetch('https://id.twitch.tv/oauth2/validate', {
    headers: {
      Authorization: `OAuth ${token}`
    }
  });

  if (!response.ok) {
    throw new Error(`Twitch token validation failed: ${response.status}`);
  }

  const result = await response.json();

  if (!result.login) {
    throw new Error('Twitch token is valid but login was not returned.');
  }

  return result;
}

function parseTwitchTokenRedirect(url) {
  const parsed = new URL(url);
  const fragment = parsed.hash.startsWith('#') ? parsed.hash.slice(1) : '';
  const params = new URLSearchParams(fragment);
  const accessToken = params.get('access_token');

  if (!accessToken) {
    return null;
  }

  return {
    accessToken,
    state: params.get('state')
  };
}

function withPiperDefaults(settings) {
  return {
    ...settings,
    obsRoute: settings?.obsRoute || '/obs',
    piperVoiceId: settings?.piperVoiceId || 'ru_RU-dmitri-medium',
    piperModelPath: '',
    piperConfigPath: '',
    sileroSpeaker: settings?.sileroSpeaker || 'xenia',
    sileroPythonPath: '',
    sileroScriptPath: '',
    sileroModelCacheDir: ''
  };
}

function getPiperRuntimeDir() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'piper');
  }

  return path.resolve(__dirname, '..', 'resources', 'piper');
}

function getPiperExecutablePath() {
  const runtimeDir = getPiperRuntimeDir();
  const nested = path.join(runtimeDir, 'piper', 'piper.exe');
  const flat = path.join(runtimeDir, 'piper.exe');
  return fs.existsSync(nested) ? nested : flat;
}

function getSileroRuntimeDir() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'silero');
  }

  return path.resolve(__dirname, '..', 'resources', 'silero');
}

function getSileroPythonPath() {
  return path.join(getSileroRuntimeDir(), 'python', 'Scripts', 'python.exe');
}

function getSileroScriptPath() {
  return path.join(getSileroRuntimeDir(), 'run_silero.py');
}

function getSileroModelCacheDir() {
  return path.join(getSileroRuntimeDir(), 'model-cache');
}
