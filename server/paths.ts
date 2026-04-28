import fs from 'fs';
import path from 'path';

const rootDir = process.cwd();

export function getDataDir(): string {
  return process.env.DATA_DIR?.trim() || path.join(rootDir, 'server');
}

export function getDbPath(): string {
  return path.join(getDataDir(), 'sar.db');
}

export function getConfigPath(): string {
  return path.join(getDataDir(), 'config.json');
}

export function getMediaPath(): string {
  const dataDir = process.env.DATA_DIR?.trim();
  return dataDir ? path.join(dataDir, 'media') : path.join(rootDir, 'media');
}

export function ensureRuntimeDirs(): void {
  const dirs = [
    getDataDir(),
    getMediaPath(),
    path.join(getMediaPath(), 'clips'),
    path.join(getMediaPath(), 'thumbs'),
  ];

  for (const dir of dirs) {
    fs.mkdirSync(dir, { recursive: true });
  }
}
