import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react';
import { BRAND } from '../lib/brand';
import { initials, scoreColor, type Tone } from '../lib/format';
import { IconAlert, IconInfo, IconLoader, IconWave, IconX, type Icon } from './icons';

export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ');
}

/* ---------- Button ---------- */

const VARIANTS = {
  primary:
    'bg-indigo-600 text-white shadow-sm shadow-indigo-600/25 hover:bg-indigo-500 focus-visible:ring-indigo-500',
  secondary:
    'bg-white text-slate-700 shadow-sm ring-1 ring-inset ring-slate-200 hover:bg-slate-50 hover:text-slate-900 focus-visible:ring-indigo-500',
  ghost: 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 focus-visible:ring-indigo-500',
  danger: 'bg-rose-600 text-white shadow-sm hover:bg-rose-500 focus-visible:ring-rose-500',
  dark: 'bg-white/10 text-white ring-1 ring-inset ring-white/10 hover:bg-white/15 focus-visible:ring-white/40 focus-visible:ring-offset-slate-950',
  'dark-danger':
    'bg-rose-500/15 text-rose-300 ring-1 ring-inset ring-rose-400/30 hover:bg-rose-500/25 focus-visible:ring-rose-400 focus-visible:ring-offset-slate-950',
} as const;

const SIZES = {
  sm: 'h-8 px-3 text-sm gap-1.5',
  md: 'h-10 px-4 text-sm gap-2',
  lg: 'h-12 px-6 text-[15px] gap-2',
} as const;

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: keyof typeof VARIANTS;
  size?: keyof typeof SIZES;
  loading?: boolean;
};

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  className,
  children,
  disabled,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      className={cn(
        'inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-lg font-medium transition-all duration-150',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 active:scale-[0.98]',
        'disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100 [&_svg]:h-4 [&_svg]:w-4',
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...rest}
    >
      {loading && <IconLoader className="animate-spin" />}
      {children}
    </button>
  );
}

/* ---------- Surfaces ---------- */

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cn('rounded-2xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]', className)}>
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  description,
  icon: IconCmp,
  action,
}: {
  title: ReactNode;
  description?: ReactNode;
  icon?: Icon;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-6 py-5">
      <div className="flex items-start gap-3">
        {IconCmp && (
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-indigo-50 text-indigo-600">
            <IconCmp className="h-[18px] w-[18px]" />
          </div>
        )}
        <div>
          <h3 className="text-[15px] font-semibold text-slate-900">{title}</h3>
          {description && <p className="mt-0.5 text-sm text-slate-500">{description}</p>}
        </div>
      </div>
      {action}
    </div>
  );
}

/* ---------- Badge ---------- */

const BADGE_TONES: Record<Tone, string> = {
  slate: 'bg-slate-100 text-slate-700 ring-slate-200',
  indigo: 'bg-indigo-50 text-indigo-700 ring-indigo-200',
  emerald: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  teal: 'bg-teal-50 text-teal-700 ring-teal-200',
  amber: 'bg-amber-50 text-amber-800 ring-amber-200',
  rose: 'bg-rose-50 text-rose-700 ring-rose-200',
  violet: 'bg-violet-50 text-violet-700 ring-violet-200',
};

const DOT_TONES: Record<Tone, string> = {
  slate: 'bg-slate-400',
  indigo: 'bg-indigo-500',
  emerald: 'bg-emerald-500',
  teal: 'bg-teal-500',
  amber: 'bg-amber-500',
  rose: 'bg-rose-500',
  violet: 'bg-violet-500',
};

export function Badge({
  tone = 'slate',
  dot = false,
  pulse = false,
  className,
  children,
}: {
  tone?: Tone;
  dot?: boolean;
  pulse?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset',
        BADGE_TONES[tone],
        className,
      )}
    >
      {dot && (
        <span className="relative flex h-1.5 w-1.5">
          {pulse && <span className={cn('absolute inline-flex h-full w-full animate-ping rounded-full opacity-75', DOT_TONES[tone])} />}
          <span className={cn('relative inline-flex h-1.5 w-1.5 rounded-full', DOT_TONES[tone])} />
        </span>
      )}
      {children}
    </span>
  );
}

/* ---------- Alert ---------- */

export function Alert({
  tone = 'error',
  children,
  onClose,
  className,
}: {
  tone?: 'error' | 'warning' | 'info';
  children: ReactNode;
  onClose?: () => void;
  className?: string;
}) {
  const styles = {
    error: 'bg-rose-50 text-rose-800 ring-rose-200',
    warning: 'bg-amber-50 text-amber-900 ring-amber-200',
    info: 'bg-indigo-50 text-indigo-900 ring-indigo-200',
  }[tone];
  const IconCmp = tone === 'info' ? IconInfo : IconAlert;
  return (
    <div role="alert" className={cn('flex items-start gap-3 rounded-xl px-4 py-3 text-sm ring-1 ring-inset animate-fade-in', styles, className)}>
      <IconCmp className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="flex-1 leading-relaxed">{children}</div>
      {onClose && (
        <button onClick={onClose} className="rounded p-0.5 opacity-60 transition hover:opacity-100" aria-label="Dismiss">
          <IconX className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

/* ---------- Form ---------- */

export function Input({ icon: IconCmp, className, ...rest }: InputHTMLAttributes<HTMLInputElement> & { icon?: Icon }) {
  return (
    <div className="relative">
      {IconCmp && <IconCmp className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />}
      <input
        className={cn(
          'block h-11 w-full rounded-lg border-0 bg-white text-sm text-slate-900 shadow-sm ring-1 ring-inset ring-slate-200 transition',
          'placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-indigo-500 disabled:opacity-60',
          IconCmp ? 'pl-10 pr-3' : 'px-3',
          className,
        )}
        {...rest}
      />
    </div>
  );
}

export function Label({ children, htmlFor }: { children: ReactNode; htmlFor?: string }) {
  return (
    <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-medium text-slate-700">
      {children}
    </label>
  );
}

/* ---------- Identity ---------- */

export function Logo({ dark = false }: { dark?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <div className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-indigo-500 via-violet-500 to-fuchsia-500 shadow-lg shadow-indigo-500/30">
        <IconWave className="h-5 w-5 text-white" strokeWidth={2.4} />
      </div>
      <span className={cn('text-lg font-semibold tracking-tight', dark ? 'text-white' : 'text-slate-900')}>
        {BRAND}
        <span className={cn('ml-1.5 rounded-md px-1.5 py-0.5 align-middle text-[10px] font-semibold uppercase tracking-wider', dark ? 'bg-white/10 text-indigo-200' : 'bg-indigo-50 text-indigo-600')}>
          AI
        </span>
      </span>
    </div>
  );
}

const AVATAR_GRADIENTS = [
  'from-indigo-500 to-violet-500',
  'from-sky-500 to-indigo-500',
  'from-emerald-500 to-teal-500',
  'from-amber-500 to-orange-500',
  'from-rose-500 to-pink-500',
  'from-violet-500 to-fuchsia-500',
];

export function Avatar({ name, size = 'md', className }: { name: string; size?: 'sm' | 'md' | 'lg'; className?: string }) {
  const hash = [...name].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7);
  const sizes = { sm: 'h-8 w-8 text-xs', md: 'h-10 w-10 text-sm', lg: 'h-14 w-14 text-lg' };
  return (
    <div
      className={cn(
        'grid shrink-0 place-items-center rounded-full bg-gradient-to-br font-semibold text-white ring-2 ring-white',
        AVATAR_GRADIENTS[hash % AVATAR_GRADIENTS.length],
        sizes[size],
        className,
      )}
    >
      {initials(name)}
    </div>
  );
}

/* ---------- Data display ---------- */

export function ScoreRing({ value, size = 128, stroke = 10, dark = false }: { value: number; size?: number; stroke?: number; dark?: boolean }) {
  const pct = Math.max(0, Math.min(100, value));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const big = size >= 100;
  return (
    <div className="relative inline-grid shrink-0 place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={dark ? 'rgba(255,255,255,0.1)' : '#eef2f7'} strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={scoreColor(pct)}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct / 100)}
          style={{ transition: 'stroke-dashoffset 1s ease-out' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={cn('font-semibold tabular-nums tracking-tight', big ? 'text-4xl' : 'text-sm', dark ? 'text-white' : 'text-slate-900')}>
          {Math.round(pct)}
        </span>
        {big && <span className={cn('text-xs', dark ? 'text-slate-400' : 'text-slate-500')}>out of 100</span>}
      </div>
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <IconLoader className={cn('h-5 w-5 animate-spin text-indigo-600', className)} />;
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-md bg-slate-100', className)} />;
}

export function EmptyState({
  icon: IconCmp,
  title,
  description,
  action,
}: {
  icon: Icon;
  title: string;
  description: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center px-6 py-14 text-center">
      <div className="relative mb-5">
        <div className="absolute inset-0 rounded-2xl bg-indigo-400/20 blur-xl" />
        <div className="relative grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-indigo-50 to-violet-50 text-indigo-600 ring-1 ring-indigo-100">
          <IconCmp className="h-6 w-6" />
        </div>
      </div>
      <h3 className="text-base font-semibold text-slate-900">{title}</h3>
      <div className="mt-1.5 max-w-sm text-sm text-slate-500">{description}</div>
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

export function Modal({ open, onClose, dark = false, children }: { open: boolean; onClose: () => void; dark?: boolean; children: ReactNode }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4">
      <div className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm animate-fade-in" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        className={cn(
          'relative w-full max-w-md rounded-2xl p-6 shadow-2xl animate-fade-up',
          dark ? 'bg-slate-900 text-slate-100 ring-1 ring-white/10' : 'bg-white text-slate-900',
        )}
      >
        {children}
      </div>
    </div>
  );
}
