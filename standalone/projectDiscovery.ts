import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

export function hashProjectPath(projectPath: string): string {
  return projectPath.replace(/[^a-zA-Z0-9-]/g, '-');
}

export function getProjectDir(projectPath: string): string {
  const hash = hashProjectPath(projectPath);
  return path.join(os.homedir(), '.claude', 'projects', hash);
}

export interface DiscoveredProject {
  hash: string;
  dir: string;
  recentJsonlFiles: string[];
  mostRecentActivity: Date | null;
}

export async function discoverProjects(): Promise<DiscoveredProject[]> {
  const baseDir = path.join(os.homedir(), '.claude', 'projects');
  const results: DiscoveredProject[] = [];

  try {
    if (!fs.existsSync(baseDir)) return results;

    const entries = fs.readdirSync(baseDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const dir = path.join(baseDir, entry.name);
      let jsonlFiles: string[] = [];
      let mostRecentActivity: Date | null = null;

      try {
        const files = fs
          .readdirSync(dir)
          .filter((f) => f.endsWith('.jsonl'))
          .map((f) => {
            const fullPath = path.join(dir, f);
            const stat = fs.statSync(fullPath);
            return { path: fullPath, mtime: stat.mtimeMs };
          })
          .sort((a, b) => b.mtime - a.mtime);

        jsonlFiles = files.map((f) => f.path);
        if (files.length > 0) {
          mostRecentActivity = new Date(files[0].mtime);
        }
      } catch {
        /* ignore */
      }

      results.push({
        hash: entry.name,
        dir,
        recentJsonlFiles: jsonlFiles,
        mostRecentActivity,
      });
    }
  } catch {
    /* ignore */
  }

  // Sort by most recent activity
  results.sort((a, b) => {
    const at = a.mostRecentActivity?.getTime() ?? 0;
    const bt = b.mostRecentActivity?.getTime() ?? 0;
    return bt - at;
  });

  return results;
}
