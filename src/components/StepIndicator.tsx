'use client';

interface StepIndicatorProps {
  steps: {
    label: string;
    description: string;
    status: 'pending' | 'active' | 'complete' | 'error';
  }[];
}

export default function StepIndicator({ steps }: StepIndicatorProps) {
  return (
    <div className="flex items-center gap-0 w-full">
      {steps.map((step, idx) => (
        <div key={idx} className="flex items-center flex-1">
          {/* Step circle */}
          <div className="flex items-center gap-3 flex-shrink-0">
            <div
              className={`
                w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold
                transition-all duration-500
                ${
                  step.status === 'complete'
                    ? 'bg-green-500/20 text-green-400 ring-2 ring-green-500/30'
                    : step.status === 'active'
                    ? 'bg-[var(--accent)]/20 text-[var(--accent-light)] ring-2 ring-[var(--accent)]/50 step-active'
                    : step.status === 'error'
                    ? 'bg-red-500/20 text-red-400 ring-2 ring-red-500/30'
                    : 'bg-[var(--bg-tertiary)] text-[var(--text-muted)] ring-1 ring-[var(--border)]'
                }
              `}
            >
              {step.status === 'complete' ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              ) : step.status === 'error' ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              ) : (
                idx + 1
              )}
            </div>

            <div className="hidden sm:block">
              <p
                className={`text-sm font-medium ${
                  step.status === 'active'
                    ? 'text-[var(--text-primary)]'
                    : step.status === 'complete'
                    ? 'text-green-400'
                    : 'text-[var(--text-muted)]'
                }`}
              >
                {step.label}
              </p>
              <p className="text-xs text-[var(--text-muted)]">{step.description}</p>
            </div>
          </div>

          {/* Connector line */}
          {idx < steps.length - 1 && (
            <div className="flex-1 mx-3 h-px bg-[var(--border)]">
              <div
                className={`h-full transition-all duration-700 ${
                  step.status === 'complete'
                    ? 'bg-green-500/40 w-full'
                    : 'bg-transparent w-0'
                }`}
              />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
