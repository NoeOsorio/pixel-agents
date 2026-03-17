import type { ToolActivity } from '../office/types.js';

export interface ActivityLabel {
  text: string;
  hasPermission: boolean;
  isWaiting: boolean;
  isActive: boolean;
}

export function getActivityLabel(
  tools: ToolActivity[] | undefined,
  status: string | undefined,
): ActivityLabel {
  const isWaiting = status === 'waiting';

  if (tools && tools.length > 0) {
    // Find the latest non-done tool
    const activeTool = [...tools].reverse().find((t) => !t.done);
    if (activeTool) {
      if (activeTool.permissionWait) {
        return { text: 'Needs approval', hasPermission: true, isWaiting: false, isActive: true };
      }
      return { text: activeTool.status, hasPermission: false, isWaiting, isActive: true };
    }
    // All tools done but potentially mid-turn
    const lastTool = tools[tools.length - 1];
    if (lastTool) {
      return { text: lastTool.status, hasPermission: false, isWaiting, isActive: false };
    }
  }

  return { text: 'Idle', hasPermission: false, isWaiting, isActive: false };
}
