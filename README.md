# MiljenTTS

MiljenTTS is a local Twitch chat TTS app for OBS. It reads only messages that start with the configured command, for example:

```text
!tts привет чат
```

Normal chat messages are ignored.

## Features

- OBS Browser Source page: `http://localhost:3000/obs`
- Debug page: `http://localhost:3000/debug`
- Twitch chat connection through `tmi.js`
- `Login with Twitch` flow with Twitch Client ID
- Manual OAuth token fallback
- Command-only TTS, default command: `!tts`
- Queue playback without overlapping messages
- Browser TTS fallback
- Piper offline TTS with Russian voices:
  - `Dmitri`
  - `Irina`
- Silero offline TTS in packaged release with speakers:
  - `aidar`
  - `baya`
  - `kseniya`
  - `xenia`
  - `eugene`
- Logs in `%APPDATA%\MiljenTTS\miljentts.log`

## Install

Use the installer from the GitHub Release:

```text
MiljenTTS Setup 0.2.0.exe
```

The release installer includes the bundled Piper and Silero runtimes. The source repository intentionally does not store the full portable Silero Python runtime because it contains very large PyTorch files.

## OBS Setup

1. Start MiljenTTS.
2. Fill Twitch settings.
3. Press `Start`.
4. In OBS add a `Browser Source`.
5. Use this URL:

   ```text
   http://localhost:3000/obs
   ```

6. Enable Browser Source audio in OBS. If you want TTS on its own mixer track, enable `Control audio via OBS`.

## Twitch Setup

There are two connection modes.

### Login with Twitch

This is the normal mode.

Required fields:

- `Channel`
- `Bot/account username`
- `Twitch Client ID`

Press `Login with Twitch`. MiljenTTS opens Twitch login, receives an access token, validates it, and saves it locally.

The Twitch app must use this OAuth Redirect URL:

```text
http://localhost:3000
```

Required token scope:

```text
chat:read
```

### Manual OAuth Token

This is the fallback mode.

Required fields:

- `Channel`
- `Bot/account username`
- `OAuth token`

Client ID is not needed for manual mode.

The OAuth token must be a Twitch user access token with `chat:read`. A Twitch stream key is not needed and is never used.

## App Settings

Settings are saved locally:

```text
%APPDATA%\MiljenTTS\config.json
```

Logs are saved locally:

```text
%APPDATA%\MiljenTTS\miljentts.log
```

## Dev Setup

Install dependencies:

```powershell
npm install
```

Run the Electron app:

```powershell
npm run app
```

Run the local server without Electron:

```powershell
npm start
```

Build the Windows installer:

```powershell
npm run dist
```

## Environment Variables

For server-only development, copy `.env.example` to `.env` and fill the values:

```env
TWITCH_CHANNEL=your_channel_name
TWITCH_USERNAME=your_bot_or_account_name
TWITCH_OAUTH_TOKEN=oauth:your_token_here
PORT=3000
READ_USERNAMES=true
TTS_COMMAND=!tts
MAX_MESSAGE_LENGTH=220
MIN_SECONDS_BETWEEN_MESSAGES=1.2
TTS_ENGINE=browser
OBS_ROUTE=/obs
PIPER_VOICE_ID=ru_RU-dmitri-medium
SILERO_SPEAKER=xenia
IGNORED_USERS=nightbot,streamelements
```

## TTS Engines

### Browser Voice

Uses the browser or OBS built-in `speechSynthesis`. This is the lightest fallback mode.

### Piper Offline

Uses bundled `piper.exe` and Russian `.onnx` voice models. Piper generated WAV files are played by the OBS page.

Included voices:

- `Dmitri`
- `Irina`

### Silero Offline

In the packaged release, Silero uses a bundled portable Python runtime and a preloaded Russian model. Generated WAV files are stored in the local audio cache and played by the OBS page.

Included speakers:

- `aidar`
- `baya`
- `kseniya`
- `xenia`
- `eugene`

## Filters

- Only messages starting with `TTS_COMMAND` are read.
- Default command is `!tts`.
- Links are replaced with the word `ссылка`.
- Long messages are cut to `MAX_MESSAGE_LENGTH`.
- Users from `IGNORED_USERS` are ignored.
- Other chat commands like `!uptime` are ignored.

## Troubleshooting

- No Twitch connection: check `Channel`, account username, and token/login.
- No OBS sound: check OBS Browser Source audio and press `Test voice`.
- Login asks for Client ID: Twitch requires Client ID for app OAuth login. Manual OAuth token mode does not need Client ID.
- Silero is slow on first phrase: the Python model loads on first generation.
- Logs: open the `Diagnostics` section in the app.
