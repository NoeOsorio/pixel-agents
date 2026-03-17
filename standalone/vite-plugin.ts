import * as fs from 'fs';
import * as path from 'path';
import type { Plugin, ViteDevServer, WebSocketClient } from 'vite';

import {
  loadCharacterSprites,
  loadDefaultLayout,
  type LoadedAssets,
  type LoadedCharacterSprites,
  type LoadedFloorTiles,
  type LoadedWallTiles,
  loadFloorTiles,
  loadFurnitureAssets,
  loadWallTiles,
} from '../shared/assetLoader.js';
import { JSONL_POLL_INTERVAL_MS } from '../shared/constants.js';
import { ensureProjectScan, readNewLines, startFileWatching } from '../shared/fileWatcher.js';
import type { LayoutWatcher } from '../shared/layoutPersistence.js';
import {
  loadLayout,
  readLayoutFromFile,
  watchLayoutFile,
  writeLayoutToFile,
} from '../shared/layoutPersistence.js';
import { cancelPermissionTimer, cancelWaitingTimer } from '../shared/timerManager.js';
import type { AgentState } from '../shared/types.js';
import type { ManagedProcess } from './processManager.js';
import { killAllProcesses, launchClaudeProcess } from './processManager.js';
import { getProjectDir } from './projectDiscovery.js';
import { loadSeats, saveSeats } from './seatPersistence.js';
import { loadSettings, saveSettings } from './settingsPersistence.js';

export interface PixelAgentsPluginOptions {
  projectPath?: string;
}

export function pixelAgentsPlugin(options: PixelAgentsPluginOptions = {}): Plugin {
  const projectPath =
    options.projectPath ?? process.env['PIXEL_AGENTS_PROJECT'] ?? process.cwd();

  // ── Server-side state (persists across WebSocket reconnections) ──────────
  const agents = new Map<number, AgentState>();
  const processes = new Map<number, ManagedProcess>();
  const fileWatchers = new Map<number, fs.FSWatcher>();
  const pollingTimers = new Map<number, ReturnType<typeof setInterval>>();
  const waitingTimers = new Map<number, ReturnType<typeof setTimeout>>();
  const permissionTimers = new Map<number, ReturnType<typeof setTimeout>>();
  const jsonlPollTimers = new Map<number, ReturnType<typeof setInterval>>();
  const nextAgentId = { current: 1 };
  const activeAgentId = { current: null as number | null };
  const knownJsonlFiles = new Set<string>();
  const projectScanTimer = { current: null as ReturnType<typeof setInterval> | null };

  // ── Cached assets (loaded once on first webviewReady) ────────────────────
  let assetsRoot: string | null = null;
  let defaultLayout: Record<string, unknown> | null = null;
  let cachedCharSprites: LoadedCharacterSprites | null = null;
  let cachedFloorTiles: LoadedFloorTiles | null = null;
  let cachedWallTiles: LoadedWallTiles | null = null;
  let cachedFurniture: LoadedAssets | null = null;
  let assetsLoaded = false;
  let assetLoadPromise: Promise<void> | null = null;

  let layoutWatcher: LayoutWatcher | null = null;

  function resolveAssetsRoot(): string | null {
    // Development: webview-ui/public/assets/ (relative to repo root)
    const candidates = [
      path.join(__dirname, '../dist/assets'),
      path.join(__dirname, '../webview-ui/public/assets'),
    ];
    for (const candidate of candidates) {
      const assetsDir = path.join(path.dirname(candidate), 'assets');
      const checkPath = candidate.endsWith('assets') ? candidate : assetsDir;
      if (fs.existsSync(checkPath)) {
        return path.dirname(checkPath);
      }
    }
    // Try current working directory (repo root)
    const cwdAssets = path.join(process.cwd(), 'dist', 'assets');
    if (fs.existsSync(cwdAssets)) return path.join(process.cwd(), 'dist');
    const cwdPublic = path.join(process.cwd(), 'webview-ui', 'public', 'assets');
    if (fs.existsSync(cwdPublic)) return path.join(process.cwd(), 'webview-ui', 'public');
    return null;
  }

  async function loadAssets(): Promise<void> {
    if (assetsLoaded) return;
    assetsLoaded = true;

    assetsRoot = resolveAssetsRoot();
    if (!assetsRoot) {
      console.warn('[Pixel Agents] Assets directory not found — sprites will be missing');
      return;
    }

    defaultLayout = loadDefaultLayout(assetsRoot);
    cachedCharSprites = await loadCharacterSprites(assetsRoot);
    cachedFloorTiles = await loadFloorTiles(assetsRoot);
    cachedWallTiles = await loadWallTiles(assetsRoot);
    cachedFurniture = await loadFurnitureAssets(assetsRoot);
    console.log('[Pixel Agents] Assets loaded');
  }

  function removeAgent(agentId: number): void {
    const agent = agents.get(agentId);
    if (!agent) return;
    const jpTimer = jsonlPollTimers.get(agentId);
    if (jpTimer) clearInterval(jpTimer);
    jsonlPollTimers.delete(agentId);
    fileWatchers.get(agentId)?.close();
    fileWatchers.delete(agentId);
    const pt = pollingTimers.get(agentId);
    if (pt) clearInterval(pt);
    pollingTimers.delete(agentId);
    try {
      fs.unwatchFile(agent.jsonlFile);
    } catch {
      /* ignore */
    }
    cancelWaitingTimer(agentId, waitingTimers);
    cancelPermissionTimer(agentId, permissionTimers);
    agents.delete(agentId);
  }

  return {
    name: 'pixel-agents-standalone',

    configureServer(server: ViteDevServer) {
      // Start loading assets eagerly (async, cached for later)
      assetLoadPromise = loadAssets();

      function broadcastTarget() {
        return {
          postMessage(msg: unknown): void {
            server.ws.send('pixel-agents:push', msg as Record<string, unknown>);
          },
        };
      }

      function adoptExistingJsonlFiles(projectDir: string): void {
        let files: string[];
        try {
          files = fs
            .readdirSync(projectDir)
            .filter((f) => f.endsWith('.jsonl'))
            .map((f) => path.join(projectDir, f));
        } catch {
          return;
        }

        for (const filePath of files) {
          if (knownJsonlFiles.has(filePath)) continue;
          knownJsonlFiles.add(filePath);

          const id = nextAgentId.current++;
          const agent: AgentState = {
            id,
            projectDir,
            jsonlFile: filePath,
            fileOffset: 0,
            lineBuffer: '',
            activeToolIds: new Set(),
            activeToolStatuses: new Map(),
            activeToolNames: new Map(),
            activeSubagentToolIds: new Map(),
            activeSubagentToolNames: new Map(),
            isWaiting: false,
            permissionSent: false,
            hadToolsInTurn: false,
          };
          agents.set(id, agent);
          console.log(`[Pixel Agents] Adopted existing session: ${path.basename(filePath)} → agent ${id}`);

          startFileWatching(
            id,
            filePath,
            agents,
            fileWatchers,
            pollingTimers,
            waitingTimers,
            permissionTimers,
            broadcastTarget(),
          );
          readNewLines(id, agents, waitingTimers, permissionTimers, broadcastTarget());
        }
      }

      async function handleWebviewReady(client: WebSocketClient): Promise<void> {
        // Ensure assets are loaded
        await assetLoadPromise;

        function sendToClient(msg: unknown): void {
          client.send('pixel-agents:push', msg as Record<string, unknown>);
        }

        const settings = loadSettings();
        sendToClient({ type: 'settingsLoaded', soundEnabled: settings.soundEnabled });

        if (cachedCharSprites) {
          sendToClient({ type: 'characterSpritesLoaded', characters: cachedCharSprites.characters });
        }
        if (cachedFloorTiles) {
          sendToClient({ type: 'floorTilesLoaded', sprites: cachedFloorTiles.sprites });
        }
        if (cachedWallTiles) {
          sendToClient({ type: 'wallTilesLoaded', sets: cachedWallTiles.sets });
        }
        if (cachedFurniture) {
          const spritesObj: Record<string, string[][]> = {};
          for (const [id, spriteData] of cachedFurniture.sprites) {
            spritesObj[id] = spriteData;
          }
          sendToClient({
            type: 'furnitureAssetsLoaded',
            catalog: cachedFurniture.catalog,
            sprites: spritesObj,
          });
        }

        // Send layout
        const layout = loadLayout(defaultLayout);
        sendToClient({ type: 'layoutLoaded', layout, wasReset: false });

        // Start layout watcher once
        if (!layoutWatcher) {
          layoutWatcher = watchLayoutFile((newLayout) => {
            server.ws.send('pixel-agents:push', {
              type: 'layoutLoaded',
              layout: newLayout,
            } as Record<string, unknown>);
          });
        }

        // Auto-discover existing Claude sessions from all project directories
        const claudeProjectsDir = getProjectDir(projectPath);
        adoptExistingJsonlFiles(claudeProjectsDir);

        // Also scan sibling project dirs so agents in other workspaces are visible
        const claudeRoot = path.dirname(claudeProjectsDir);
        try {
          for (const entry of fs.readdirSync(claudeRoot, { withFileTypes: true })) {
            if (entry.isDirectory()) {
              const dir = path.join(claudeRoot, entry.name);
              if (dir !== claudeProjectsDir) {
                adoptExistingJsonlFiles(dir);
              }
            }
          }
        } catch {
          /* ~/.claude/projects may not exist or have permission issues */
        }

        // Send existing agents
        const agentIds: number[] = [...agents.keys()].sort((a, b) => a - b);
        const agentMeta = loadSeats();
        sendToClient({ type: 'existingAgents', agents: agentIds, agentMeta, folderNames: {} });

        // Re-send current tool states
        for (const [agentId, agent] of agents) {
          for (const [toolId, status] of agent.activeToolStatuses) {
            sendToClient({ type: 'agentToolStart', id: agentId, toolId, status });
          }
          if (agent.isWaiting) {
            sendToClient({ type: 'agentStatus', id: agentId, status: 'waiting' });
          }
        }

        // Ensure project scan
        const projectDir = getProjectDir(projectPath);
        ensureProjectScan(
          projectDir,
          knownJsonlFiles,
          projectScanTimer,
          activeAgentId,
          nextAgentId,
          agents,
          fileWatchers,
          pollingTimers,
          waitingTimers,
          permissionTimers,
          broadcastTarget(),
          () => { /* no-op persistence */ },
        );
      }

      server.ws.on('pixel-agents:msg', async (data: Record<string, unknown>, client) => {
        const msg = data;

        switch (msg.type) {
          case 'webviewReady': {
            await handleWebviewReady(client);
            break;
          }

          case 'openClaude': {
            const folderPath = (msg.folderPath as string | undefined) ?? projectPath;
            const sessionId = crypto.randomUUID();
            const projectDir = getProjectDir(folderPath);
            const expectedFile = path.join(projectDir, `${sessionId}.jsonl`);
            knownJsonlFiles.add(expectedFile);

            const id = nextAgentId.current++;
            const agent: AgentState = {
              id,
              projectDir,
              jsonlFile: expectedFile,
              fileOffset: 0,
              lineBuffer: '',
              activeToolIds: new Set(),
              activeToolStatuses: new Map(),
              activeToolNames: new Map(),
              activeSubagentToolIds: new Map(),
              activeSubagentToolNames: new Map(),
              isWaiting: false,
              permissionSent: false,
              hadToolsInTurn: false,
            };
            agents.set(id, agent);
            activeAgentId.current = id;

            const proc = launchClaudeProcess(sessionId, folderPath);
            processes.set(id, proc);
            proc.onExit((code) => {
              console.log(`[Pixel Agents] Agent ${id} exited with code ${code}`);
              processes.delete(id);
              removeAgent(id);
              server.ws.send('pixel-agents:push', { type: 'agentClosed', id } as Record<string, unknown>);
            });

            server.ws.send('pixel-agents:push', { type: 'agentCreated', id } as Record<string, unknown>);

            ensureProjectScan(
              projectDir,
              knownJsonlFiles,
              projectScanTimer,
              activeAgentId,
              nextAgentId,
              agents,
              fileWatchers,
              pollingTimers,
              waitingTimers,
              permissionTimers,
              broadcastTarget(),
              () => { /* no-op */ },
            );

            const pollTimer = setInterval(() => {
              try {
                if (fs.existsSync(agent.jsonlFile)) {
                  clearInterval(pollTimer);
                  jsonlPollTimers.delete(id);
                  startFileWatching(
                    id,
                    agent.jsonlFile,
                    agents,
                    fileWatchers,
                    pollingTimers,
                    waitingTimers,
                    permissionTimers,
                    broadcastTarget(),
                  );
                  readNewLines(id, agents, waitingTimers, permissionTimers, broadcastTarget());
                }
              } catch { /* file may not exist yet */ }
            }, JSONL_POLL_INTERVAL_MS);
            jsonlPollTimers.set(id, pollTimer);
            break;
          }

          case 'focusAgent': {
            console.log(`[Pixel Agents] focusAgent ${msg.id as number} (no-op in standalone)`);
            break;
          }

          case 'closeAgent': {
            const agentId = msg.id as number;
            processes.get(agentId)?.kill();
            processes.delete(agentId);
            removeAgent(agentId);
            server.ws.send('pixel-agents:push', { type: 'agentClosed', id: agentId } as Record<string, unknown>);
            break;
          }

          case 'saveLayout': {
            layoutWatcher?.markOwnWrite();
            writeLayoutToFile(msg.layout as Record<string, unknown>);
            break;
          }

          case 'saveAgentSeats': {
            saveSeats(msg.seats as Record<string, { palette?: number; seatId?: string }>);
            break;
          }

          case 'setSoundEnabled': {
            const settings = loadSettings();
            settings.soundEnabled = msg.enabled as boolean;
            saveSettings(settings);
            break;
          }

          case 'exportLayout': {
            const layout = readLayoutFromFile();
            if (layout) {
              client.send('pixel-agents:push', {
                type: 'exportLayoutData',
                data: JSON.stringify(layout, null, 2),
              } as Record<string, unknown>);
            }
            break;
          }

          case 'importLayout': {
            const imported = msg.layout as Record<string, unknown>;
            if (imported.version !== 1 || !Array.isArray(imported.tiles)) {
              client.send('pixel-agents:push', {
                type: 'importLayoutError',
                message: 'Invalid layout file',
              } as Record<string, unknown>);
              return;
            }
            layoutWatcher?.markOwnWrite();
            writeLayoutToFile(imported);
            server.ws.send('pixel-agents:push', {
              type: 'layoutLoaded',
              layout: imported,
            } as Record<string, unknown>);
            break;
          }

          case 'openSessionsFolder': {
            console.log(`[Pixel Agents] Project dir: ${getProjectDir(projectPath)}`);
            break;
          }
        }
      });

      // Clean up on server close
      server.httpServer?.on('close', () => {
        layoutWatcher?.dispose();
        layoutWatcher = null;
        killAllProcesses(processes);
        for (const id of [...agents.keys()]) {
          removeAgent(id);
        }
        if (projectScanTimer.current) {
          clearInterval(projectScanTimer.current);
          projectScanTimer.current = null;
        }
      });
    },
  };
}
