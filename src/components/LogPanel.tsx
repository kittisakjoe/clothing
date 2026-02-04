'use client';

import { useRef, useEffect } from 'react';

export interface LogEntry {
  id: string;
  timestamp: Date;
  type: 'info' | 'success' | 'error' | 'warning' | 'step';
  message: string;
}

interface LogPanelProps {
  logs: LogEntry[];
  maxHeight?: string;
}

export default function LogPanel({ logs, maxHeight = '300px' }: LogPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [logs]);

  const getColor = (type: LogEntry['type']) => {
    switch (type) {
      case 'success': return 'text-green-400';
      case 'error': return 'text-red-400';
      case 'warning': return 'text-yellow-400';
      case 'step': return 'text-[var(--accent-light)]';
      default: return 'text-[var(--text-secondary)]';
    }
  };

  const getPrefix = (type: LogEntry['type']) => {
    switch (type) {
      case 'success': return '✓';
      case 'error': return '✗';
      case 'warning': return '⚠';
      case 'step': return '→';
      default: return '·';
    }
  };

  return (
    <div
      ref={containerRef}
      className="log-container overflow-y-auto rounded-lg bg-[var(--bg-primary)] border border-[var(--border)] p-4"
      style={{ maxHeight }}
    >
      {logs.length === 0 ? (
        <p className="text-[var(--text-muted)] text-sm font-mono">
          Waiting for pipeline to start...
        </p>
      ) : (
        <div className="space-y-1">
          {logs.map((log) => (
            <div key={log.id} className="flex gap-2 text-sm font-mono">
              <span className="text-[var(--text-muted)] flex-shrink-0 text-xs leading-5">
                {log.timestamp.toLocaleTimeString('en-US', { hour12: false })}
              </span>
              <span className={`flex-shrink-0 w-4 text-center ${getColor(log.type)}`}>
                {getPrefix(log.type)}
              </span>
              <span className={getColor(log.type)}>{log.message}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
