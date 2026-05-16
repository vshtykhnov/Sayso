# Release Notes

## MiljenTTS 0.2.0

### What Changed

- Added dedicated OBS audio route: `/obs`.
- Kept visual troubleshooting page at `/debug`.
- Added Twitch login flow with `Twitch Client ID`.
- Kept manual OAuth token as an advanced fallback.
- Added command-only TTS: only `!tts text` messages are spoken.
- Added Piper offline engine.
- Added Piper Russian voices:
  - `Dmitri`
  - `Irina`
- Added Silero offline engine in the packaged app.
- Added Silero Russian speakers:
  - `aidar`
  - `baya`
  - `kseniya`
  - `xenia`
  - `eugene`
- Added local log file:
  - `%APPDATA%\MiljenTTS\miljentts.log`
- Added clearer Twitch UI:
  - shared fields
  - Login with Twitch
  - Manual OAuth token

### Release Artifact

Attach this file to the GitHub Release:

```text
dist\MiljenTTS Setup 0.2.0.exe
```

Do not commit the installer into git. It is too large for normal source control and belongs in GitHub Releases.

### GitHub Release Steps

1. Open the repository on GitHub.
2. Go to `Releases`.
3. Click `Draft a new release`.
4. Tag:

   ```text
   v0.2.0
   ```

5. Release title:

   ```text
   MiljenTTS 0.2.0
   ```

6. Paste the notes from this file.
7. Upload:

   ```text
   dist\MiljenTTS Setup 0.2.0.exe
   ```

8. Publish the release.

### Verification

Before publishing, these commands should pass:

```powershell
npm run check
npm test
npm audit
npm run dist
```

Current release was verified with:

- `npm run check`
- `npm test`
- `npm audit`
- `npm run dist`
- packaged Piper Irina WAV generation
- packaged Silero Xenia WAV generation
