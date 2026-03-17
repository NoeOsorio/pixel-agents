import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { PIXEL_AGENTS_DIR, SEATS_FILE_NAME } from './constants.js';

export type AgentMeta = Record<string, { palette?: number; hueShift?: number; seatId?: string }>;

function getSeatsPath(): string {
  return path.join(os.homedir(), PIXEL_AGENTS_DIR, SEATS_FILE_NAME);
}

export function loadSeats(): AgentMeta {
  const filePath = getSeatsPath();
  try {
    if (!fs.existsSync(filePath)) return {};
    const raw = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(raw) as AgentMeta;
  } catch {
    return {};
  }
}

export function saveSeats(seats: AgentMeta): void {
  const filePath = getSeatsPath();
  const dir = path.dirname(filePath);
  const tmpPath = filePath + '.tmp';
  try {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(tmpPath, JSON.stringify(seats, null, 2), 'utf-8');
    fs.renameSync(tmpPath, filePath);
  } catch (err) {
    console.error('[Standalone] Failed to save seats:', err);
  }
}
