import fs from 'node:fs';
import path from 'node:path';

export function createLogger(logDir, options = {}) {
  const fileName = options.fileName || 'miljentts.log';
  const maxBytes = options.maxBytes || 1024 * 1024;
  const logPath = path.join(logDir, fileName);

  fs.mkdirSync(logDir, { recursive: true });
  rotateIfNeeded(logPath, maxBytes);

  return {
    logPath,
    info(message, meta) {
      write(logPath, 'info', message, meta);
    },
    warn(message, meta) {
      write(logPath, 'warn', message, meta);
    },
    error(message, meta) {
      write(logPath, 'error', message, meta);
    }
  };
}

export function createConsoleLogger() {
  return {
    logPath: null,
    info(message, meta) {
      console.log(formatConsole(message, meta));
    },
    warn(message, meta) {
      console.warn(formatConsole(message, meta));
    },
    error(message, meta) {
      console.error(formatConsole(message, meta));
    }
  };
}

function write(logPath, level, message, meta) {
  const entry = {
    ts: new Date().toISOString(),
    level,
    message,
    ...(meta === undefined ? {} : { meta })
  };

  fs.appendFileSync(logPath, `${JSON.stringify(entry)}\n`, 'utf8');
}

function rotateIfNeeded(logPath, maxBytes) {
  try {
    const stat = fs.statSync(logPath);

    if (stat.size < maxBytes) {
      return;
    }

    const rotated = logPath.replace(/\.log$/i, '.old.log');
    fs.rmSync(rotated, { force: true });
    fs.renameSync(logPath, rotated);
  } catch {
    // No existing log file yet.
  }
}

function formatConsole(message, meta) {
  return meta === undefined ? message : `${message} ${JSON.stringify(meta)}`;
}
