import { cn } from './ui';

export type OrbState = 'idle' | 'speaking' | 'listening' | 'thinking';

const PALETTES: Record<OrbState, string> = {
  idle: 'from-indigo-500 via-violet-500 to-fuchsia-500',
  speaking: 'from-indigo-500 via-violet-500 to-fuchsia-500',
  listening: 'from-emerald-400 via-teal-400 to-cyan-500',
  thinking: 'from-amber-300 via-orange-400 to-pink-500',
};

/** Animated "AI interviewer" presence that reflects the conversation state. */
export default function AiOrb({ state, size = 'lg' }: { state: OrbState; size?: 'md' | 'lg' }) {
  const palette = PALETTES[state];
  const outer = size === 'lg' ? 'h-60 w-60' : 'h-44 w-44';
  const core = size === 'lg' ? 'h-32 w-32' : 'h-24 w-24';

  return (
    <div className={cn('relative grid place-items-center', outer)}>
      {/* glow */}
      <div className={cn('absolute inset-6 rounded-full bg-gradient-to-br opacity-50 blur-3xl transition-all duration-700', palette)} />

      {/* speaking: expanding rings */}
      {state === 'speaking' &&
        [0, 0.8, 1.6].map((delay) => (
          <span
            key={delay}
            className={cn('absolute rounded-full border border-violet-300/50 animate-pulse-ring', core)}
            style={{ animationDelay: `${delay}s` }}
          />
        ))}

      {/* thinking: orbiting arc */}
      {state === 'thinking' && (
        <div
          className="absolute h-[70%] w-[70%] rounded-full animate-spin-slow"
          style={{
            background: 'conic-gradient(from 0deg, transparent 0 65%, rgba(251, 191, 36, 0.95))',
            WebkitMaskImage: 'radial-gradient(circle, transparent 64%, #000 65%)',
            maskImage: 'radial-gradient(circle, transparent 64%, #000 65%)',
          }}
        />
      )}

      {/* listening: soft halo */}
      {state === 'listening' && <span className={cn('absolute rounded-full ring-2 ring-emerald-300/40 animate-breathe', core, 'scale-125')} />}

      {/* core */}
      <div
        className={cn(
          'relative overflow-hidden rounded-full bg-gradient-to-br shadow-2xl transition-all duration-700',
          palette,
          core,
          state === 'speaking' && 'animate-breathe',
          state === 'idle' && 'animate-float',
        )}
      >
        <div className="absolute inset-0 rounded-full bg-[radial-gradient(circle_at_30%_25%,rgba(255,255,255,0.6),transparent_55%)]" />
        {(state === 'listening' || state === 'speaking') && (
          <div className="absolute inset-0 flex items-center justify-center gap-1.5">
            {[0, 0.15, 0.3, 0.45, 0.6].map((d, i) => (
              <span
                key={d}
                className="w-1.5 origin-center rounded-full bg-white/90 animate-eq"
                style={{ height: `${[18, 30, 40, 30, 18][i]}px`, animationDelay: `${d}s` }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
