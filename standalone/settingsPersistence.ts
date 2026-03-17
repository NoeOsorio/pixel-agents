import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { PIXEL_AGENTS_DIR, SETTINGS_FILE_NAME } from './constants.js';

export interface StandaloneSettings {
  soundEnabled: boolean;
}

const DEFAULT_SETTINGS: StandaloneSettings = {
  soundEnabled: true,
};

function getSettingsPath(): string {
  return path.join(os.homedir(), PIXEL_AGENTS_DIR, SETTINGS_FILE_NAME);
}

export function loadSettings(): StandaloneSettings {
  const filePath = getSettingsPath();
  try {
    if (!fs.existsSync(filePath)) return { ...DEFAULT_SETTINGS };
    const raw = fs.readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<StandaloneSettings>;
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings: StandaloneSettings): void {
  const filePath = getSettingsPath();
  const dir = path.dirname(filePath);
  const tmpPath = filePath + '.tmp';
  try {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(tmpPath, JSON.stringify(settings, null, 2), 'utf-8');
    fs.renameSync(tmpPath, filePath);
  } catch (err) {
    console.error('[Standalone] Failed to save settings:', err);
  }
}
