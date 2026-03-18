import { useEffect, useState } from 'react';

import { AGENT_NAME_MAX_LENGTH, CRT_ROSTER_MAX_HEIGHT, CRT_SUBAGENT_LABEL_MAX_WIDTH } from '../constants.js';
import type { SubagentCharacter } from '../hooks/useExtensionMessages.js';
import type { OfficeState } from '../office/engine/officeState.js';
import type { ToolActivity } from '../office/types.js';
import { getActivityLabel } from '../utils/activityText.js';

interface CrtSidebarProps {
  officeState: OfficeState;
  agentTools: Record<number, ToolActivity[]>;
  agentStatuses: Record<number, string>;
  subagentTools: Record<number, Record<string, ToolActivity[]>>;
  agents: number[];
  subagentCharacters: SubagentCharacter[];
  onSelectAgent: (id: number) => void;
  onCloseAgent: (id: number) => void;
  agentNames: Record<number, string>;
  onRenameAgent: (id: number, name: string) => void;
}

export function CrtSidebar({
  officeState,
  agentTools,
  agentStatuses,
  subagentTools,
  agents,
  subagentCharacters,
  onSelectAgent,
  onCloseAgent,
  agentNames,
  onRenameAgent,
}: CrtSidebarProps) {
  // RAF loop to stay in sync with imperative officeState (same pattern as ToolOverlay)
  const [, setTick] = useState(0);
  useEffect(() => {
    let rafId = 0;
    const tick = () => {
      setTick((n) => n + 1);
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, []);

  // Editable name state for the selected agent header
  const [editName, setEditName] = useState('');

  const selectedAgentId = officeState.selectedAgentId;

  // Sync editName when selected agent changes
  useEffect(() => {
    if (selectedAgentId !== null && selectedAgentId >= 0) {
      setEditName(agentNames[selectedAgentId] ?? '');
    }
  }, [selectedAgentId, agentNames]);
  const hasAgent = selectedAgentId !== null;

  // For sub-agents (negative IDs), look up tools via subagentMeta
  let label = null;
  if (hasAgent) {
    if (selectedAgentId < 0) {
      const meta = officeState.subagentMeta.get(selectedAgentId);
      const tools = meta
        ? (subagentTools[meta.parentAgentId]?.[meta.parentToolId] ?? [])
        : [];
      label = getActivityLabel(tools, undefined);
    } else {
      label = getActivityLabel(agentTools[selectedAgentId], agentStatuses[selectedAgentId]);
    }
  }

  const isAgentIdle = (id: number) => {
    const hasActiveTools = agentTools[id]?.some((t) => !t.done) ?? false;
    const status = agentStatuses[id];
    return !hasActiveTools && status !== 'active' && status !== 'waiting';
  };

  const idleAgents = agents.filter(isAgentIdle);

  const rosterFontStyle: React.CSSProperties = {
    fontFamily: "'FS Pixel Sans', monospace",
    fontSize: 13,
    userSelect: 'none',
  };

  return (
    <div
      style={{
        width: 'var(--crt-sidebar-width)',
        flexShrink: 0,
        height: '100%',
        background: 'var(--crt-bezel)',
        borderLeft: '2px solid var(--crt-bezel-border)',
        display: 'flex',
        flexDirection: 'column',
        padding: 16,
        gap: 10,
        boxSizing: 'border-box',
        borderRadius: 0,
      }}
    >
      {/* Title row */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <span
          style={{
            color: 'var(--crt-text-dim)',
            fontSize: 13,
            letterSpacing: 3,
            fontFamily: "'FS Pixel Sans', monospace",
            userSelect: 'none',
          }}
        >
          PIXEL AGENTS
        </span>
        {idleAgents.length > 0 && (
          <button
            onClick={() => idleAgents.forEach((id) => onCloseAgent(id))}
            title={`Close ${idleAgents.length} idle agent${idleAgents.length > 1 ? 's' : ''}`}
            style={{
              background: 'none',
              border: '1px solid var(--crt-text-dim)',
              color: 'var(--crt-text-dim)',
              fontFamily: "'FS Pixel Sans', monospace",
              fontSize: 11,
              padding: '1px 6px',
              cursor: 'pointer',
              borderRadius: 0,
              userSelect: 'none',
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.color = 'var(--pixel-close-hover)';
              (e.currentTarget as HTMLElement).style.borderColor = 'var(--pixel-close-hover)';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.color = 'var(--crt-text-dim)';
              (e.currentTarget as HTMLElement).style.borderColor = 'var(--crt-text-dim)';
            }}
          >
            CLOSE IDLE ({idleAgents.length})
          </button>
        )}
      </div>

      {/* Agents roster */}
      <div
        style={{
          maxHeight: CRT_ROSTER_MAX_HEIGHT,
          overflowY: 'auto',
          borderRadius: 0,
          border: '2px solid var(--crt-bezel-border)',
          background: 'var(--crt-screen-bg)',
          boxSizing: 'border-box',
          padding: '6px 0',
        }}
      >
        {agents.length === 0 ? (
          <div
            style={{
              ...rosterFontStyle,
              color: 'var(--crt-text-dim)',
              textAlign: 'center',
              padding: '8px 0',
            }}
          >
            NO AGENTS
          </div>
        ) : (
          agents.map((id) => {
            const isSelected = id === selectedAgentId;
            const isActive =
              (agentTools[id]?.length ?? 0) > 0 ||
              (agentStatuses[id] !== undefined && agentStatuses[id] !== 'idle');
            const agentSubagents = subagentCharacters.filter((s) => s.parentAgentId === id);

            return (
              <div key={id}>
                {/* Agent row */}
                <div
                  style={{
                    ...rosterFontStyle,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    padding: '3px 10px',
                    cursor: 'pointer',
                    color: isSelected ? 'var(--crt-text)' : 'var(--crt-text-dim)',
                    background: isSelected ? 'rgba(255,255,255,0.04)' : 'transparent',
                  }}
                  onClick={() => onSelectAgent(id)}
                >
                  <span style={{ flexShrink: 0 }}>{isSelected ? '>' : ' '}</span>
                  <span style={{ flex: 1 }}>{agentNames[id] ?? `Agent ${id}`}</span>
                  <span
                    style={{
                      color: isActive ? 'var(--pixel-overlay-active)' : 'var(--crt-text-dim)',
                      flexShrink: 0,
                    }}
                  >
                    {isActive ? '[ACTIVE]' : '[IDLE]'}
                  </span>
                </div>

                {/* Sub-agent rows */}
                {agentSubagents.map((s) => (
                  <div
                    key={s.id}
                    style={{
                      ...rosterFontStyle,
                      display: 'flex',
                      alignItems: 'center',
                      paddingLeft: 26,
                      paddingRight: 10,
                      paddingTop: 2,
                      paddingBottom: 2,
                      cursor: 'pointer',
                      color: 'var(--crt-text-dim)',
                    }}
                    onClick={() => onSelectAgent(id)}
                  >
                    <span style={{ flexShrink: 0, marginRight: 4 }}>|--</span>
                    <span
                      style={{
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        maxWidth: CRT_SUBAGENT_LABEL_MAX_WIDTH,
                      }}
                    >
                      {s.label.length > AGENT_NAME_MAX_LENGTH ? s.label.slice(0, AGENT_NAME_MAX_LENGTH) : s.label}
                    </span>
                  </div>
                ))}
              </div>
            );
          })
        )}
      </div>

      {/* CRT screen */}
      <div
        className="crt-screen"
        style={{
          background: 'var(--crt-screen-bg)',
          flex: 1,
          padding: 16,
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          border: '2px solid var(--crt-screen-border)',
          boxShadow: 'inset 2px 2px 0px #0a0a14',
          boxSizing: 'border-box',
          fontFamily: "'FS Pixel Sans', monospace",
          color: 'var(--crt-text)',
          position: 'relative',
        }}
      >
        {hasAgent && label !== null ? (
          <>
            {/* Agent header */}
            <div
              style={{
                fontSize: 20,
                color: 'var(--crt-text)',
                display: 'flex',
                alignItems: 'center',
                gap: 4,
              }}
            >
              <span style={{ userSelect: 'none', flexShrink: 0 }}>{'>'}</span>
              {selectedAgentId >= 0 ? (
                <input
                  type="text"
                  value={editName}
                  maxLength={AGENT_NAME_MAX_LENGTH}
                  onChange={(e) => setEditName(e.target.value)}
                  onKeyDown={(e) => {
                    e.stopPropagation();
                    if (e.key === 'Enter') {
                      const trimmed = editName.trim();
                      if (trimmed) {
                        onRenameAgent(selectedAgentId, trimmed);
                      } else {
                        setEditName(agentNames[selectedAgentId] ?? '');
                      }
                      (e.currentTarget as HTMLInputElement).blur();
                    } else if (e.key === 'Escape') {
                      setEditName(agentNames[selectedAgentId] ?? '');
                      (e.currentTarget as HTMLInputElement).blur();
                    }
                  }}
                  onBlur={() => {
                    const trimmed = editName.trim();
                    if (trimmed) {
                      onRenameAgent(selectedAgentId, trimmed);
                    } else {
                      setEditName(agentNames[selectedAgentId] ?? '');
                    }
                  }}
                  style={{
                    fontFamily: "'FS Pixel Sans', monospace",
                    fontSize: 20,
                    color: 'var(--crt-text)',
                    background: 'transparent',
                    border: 'none',
                    borderBottom: '1px solid var(--crt-text-dim)',
                    outline: 'none',
                    padding: '0 2px',
                    width: '100%',
                    borderRadius: 0,
                    userSelect: 'text',
                  }}
                />
              ) : (
                <span style={{ userSelect: 'none' }}>{`AGENT ${selectedAgentId}`}</span>
              )}
            </div>

            {/* Separator */}
            <div
              style={{
                fontSize: 13,
                color: 'var(--crt-text-dim)',
                userSelect: 'none',
              }}
            >
              {'───────────────'}
            </div>

            {/* Status */}
            <div style={{ flex: 1, fontSize: 18 }}>
              {label.hasPermission ? (
                <span style={{ color: 'var(--pixel-overlay-permission)' }}>
                  AWAITING INPUT
                  <span
                    style={{
                      display: 'inline-block',
                      marginLeft: 2,
                      animation: 'crt-blink 1s step-start infinite',
                    }}
                  >
                    _
                  </span>
                </span>
              ) : label.fullText && label.fullText !== 'Idle' ? (
                <span
                  style={{
                    color: label.isActive ? 'var(--pixel-overlay-active)' : 'var(--crt-text)',
                    display: 'block',
                    overflow: 'auto',
                    wordBreak: 'break-all',
                    whiteSpace: 'pre-wrap',
                  }}
                >
                  {label.fullText}
                </span>
              ) : (
                <span style={{ color: 'var(--crt-text)' }}>
                  IDLE
                  <span
                    style={{
                      display: 'inline-block',
                      marginLeft: 2,
                      animation: 'crt-blink 1s step-start infinite',
                    }}
                  >
                    _
                  </span>
                </span>
              )}
            </div>

            {/* Bottom status decoration */}
            <div
              style={{
                fontSize: 13,
                color: 'var(--crt-text-dim)',
                userSelect: 'none',
                marginTop: 'auto',
              }}
            >
              SYS:OK&nbsp;&nbsp;MEM:--
            </div>
          </>
        ) : (
          /* No signal state */
          <div
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 24,
              color: 'var(--crt-no-signal)',
              userSelect: 'none',
              animation: 'crt-flicker 4s ease-in-out infinite',
            }}
          >
            NO SIGNAL
          </div>
        )}
      </div>

      {/* Power LED row */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
          gap: 4,
        }}
      >
        <span
          style={{
            fontSize: 12,
            color: 'var(--crt-text-dim)',
            fontFamily: "'FS Pixel Sans', monospace",
            userSelect: 'none',
          }}
        >
          PWR
        </span>
        <div
          style={{
            width: 6,
            height: 6,
            background: hasAgent ? 'var(--crt-text)' : 'var(--crt-bezel)',
            borderRadius: 0,
            flexShrink: 0,
          }}
        />
      </div>
    </div>
  );
}
