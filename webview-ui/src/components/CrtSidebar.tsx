import { useEffect, useState } from 'react';

import type { OfficeState } from '../office/engine/officeState.js';
import type { ToolActivity } from '../office/types.js';
import { getActivityLabel } from '../utils/activityText.js';

interface CrtSidebarProps {
  officeState: OfficeState;
  agentTools: Record<number, ToolActivity[]>;
  agentStatuses: Record<number, string>;
}

export function CrtSidebar({ officeState, agentTools, agentStatuses }: CrtSidebarProps) {
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

  const selectedAgentId = officeState.selectedAgentId;
  const hasAgent = selectedAgentId !== null;

  const label = hasAgent
    ? getActivityLabel(agentTools[selectedAgentId], agentStatuses[selectedAgentId])
    : null;

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
          color: 'var(--crt-text-dim)',
          fontSize: 13,
          letterSpacing: 3,
          fontFamily: "'FS Pixel Sans', monospace",
          userSelect: 'none',
        }}
      >
        PIXEL AGENTS
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
          boxShadow: 'inset 2px 2px 0px #000000',
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
                userSelect: 'none',
              }}
            >
              {`> AGENT ${selectedAgentId}`}
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
