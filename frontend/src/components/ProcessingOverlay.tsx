import { useEffect, useState } from 'react';
import { IconCheckCircle, IconCircle, IconLoader, IconSparkles } from './icons';
import { cn } from './ui';

/** Full-screen progress while a slow AI call runs. Steps advance on a timer and hold on the last one. */
export default function ProcessingOverlay({
  title,
  subtitle,
  steps,
  dark = false,
  stepMs = 2800,
}: {
  title: string;
  subtitle?: string;
  steps: string[];
  dark?: boolean;
  stepMs?: number;
}) {
  const [active, setActive] = useState(0);

  useEffect(() => {
    const t = window.setInterval(() => setActive((a) => Math.min(a + 1, steps.length - 1)), stepMs);
    return () => window.clearInterval(t);
  }, [steps.length, stepMs]);

  return (
    <div className={cn('fixed inset-0 z-50 grid place-items-center p-4 backdrop-blur-md animate-fade-in', dark ? 'bg-slate-950/80' : 'bg-slate-50/70')}>
      <div
        className={cn(
          'w-full max-w-sm rounded-2xl p-8 shadow-2xl animate-fade-up',
          dark ? 'bg-slate-900 text-white ring-1 ring-white/10' : 'bg-white ring-1 ring-slate-200',
        )}
      >
        <div className="mx-auto mb-5 grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-indigo-500 via-violet-500 to-fuchsia-500 shadow-lg shadow-indigo-500/30">
          <IconSparkles className="h-6 w-6 animate-pulse text-white" />
        </div>
        <h3 className="text-center text-lg font-semibold">{title}</h3>
        {subtitle && <p className={cn('mt-1 text-center text-sm', dark ? 'text-slate-400' : 'text-slate-500')}>{subtitle}</p>}
        <ol className="mt-7 space-y-3.5">
          {steps.map((s, i) => (
            <li key={s} className="flex items-center gap-3 text-sm">
              {i < active ? (
                <IconCheckCircle className="h-5 w-5 shrink-0 text-emerald-500" />
              ) : i === active ? (
                <IconLoader className="h-5 w-5 shrink-0 animate-spin text-indigo-500" />
              ) : (
                <IconCircle className={cn('h-5 w-5 shrink-0', dark ? 'text-slate-700' : 'text-slate-300')} />
              )}
              <span className={cn(i <= active ? (dark ? 'text-white' : 'text-slate-900') : dark ? 'text-slate-500' : 'text-slate-400', i === active && 'font-medium')}>
                {s}
              </span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
