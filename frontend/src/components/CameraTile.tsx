import { useEffect, useRef } from 'react';
import { MONITOR_STATUS, type MonitorStatus } from '../hooks/useIntegrityMonitor';
import { IconVideoOff } from './icons';
import { cn } from './ui';

const TONE_STYLES = {
  ok: { dot: 'bg-emerald-400', ring: 'ring-emerald-400/40', pill: 'text-emerald-200 ring-emerald-400/30' },
  warn: { dot: 'bg-amber-400', ring: 'ring-amber-400/60', pill: 'text-amber-200 ring-amber-400/40' },
  bad: { dot: 'bg-rose-500', ring: 'ring-rose-500/60', pill: 'text-rose-200 ring-rose-400/40' },
  muted: { dot: 'bg-slate-400', ring: 'ring-white/10', pill: 'text-slate-300 ring-white/10' },
};

/**
 * Mirrored self-view with the live attention status.
 * `large` (lobby): status overlaid on the video. Small (in the interview): status in a pill below the video,
 * so it's never clipped.
 */
export default function CameraTile({
  stream,
  status,
  className,
  large = false,
}: {
  stream: MediaStream | null;
  status: MonitorStatus;
  className?: string;
  large?: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const meta = MONITOR_STATUS[status];
  const tone = TONE_STYLES[meta.tone];

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.srcObject = stream;
    if (stream) void video.play().catch(() => {});
  }, [stream]);

  const dot = <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', tone.dot, meta.tone !== 'muted' && 'animate-pulse')} />;

  const view = (
    <div className={cn('relative overflow-hidden rounded-xl bg-slate-900 shadow-2xl ring-2 transition-colors', tone.ring, large ? className : 'h-[84px] w-28 sm:h-[124px] sm:w-44')}>
      {stream ? (
        <video ref={videoRef} muted playsInline className="h-full w-full -scale-x-100 object-cover" />
      ) : (
        <div className="grid h-full w-full place-items-center text-slate-500">
          <IconVideoOff className={large ? 'h-8 w-8' : 'h-5 w-5'} />
        </div>
      )}
      {large && (
        <div className="absolute inset-x-0 bottom-0 flex items-center gap-1.5 bg-gradient-to-t from-slate-950/90 to-transparent px-3 pb-2.5 pt-6 text-xs text-white">
          {dot}
          <span>{meta.label}</span>
        </div>
      )}
    </div>
  );

  if (large) return view;

  return (
    <div className={cn('flex flex-col items-center gap-1.5', className)}>
      {view}
      <span
        className={cn(
          'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-slate-900/90 px-2.5 py-1 text-[11px] font-medium shadow-lg ring-1 ring-inset backdrop-blur',
          tone.pill,
        )}
      >
        {dot}
        {meta.label}
      </span>
    </div>
  );
}
