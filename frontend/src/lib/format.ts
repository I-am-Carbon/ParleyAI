export type ExperienceLevel = 'fresher' | 'junior' | 'mid' | 'senior';

export const EXPERIENCE_LEVELS: Array<{ value: ExperienceLevel; label: string; years: string; text: string }> = [
  { value: 'fresher', label: 'Fresher', years: '0 years', text: 'Student or new graduate. Fundamentals and projects.' },
  { value: 'junior', label: 'Junior', years: '1–2 years', text: 'Hands-on building, debugging and tools.' },
  { value: 'mid', label: 'Mid-level', years: '3–5 years', text: 'Design trade-offs and owning features.' },
  { value: 'senior', label: 'Senior', years: '5+ years', text: 'Architecture, scale and leadership.' },
];

/** e.g. "Junior · 1–2 yrs" */
export function levelLabel(level: string | null | undefined): string | null {
  const l = EXPERIENCE_LEVELS.find((x) => x.value === level);
  return l ? `${l.label} · ${l.years.replace('years', 'yrs')}` : null;
}

export type Tone ='slate' | 'indigo' | 'emerald' | 'teal' | 'amber' | 'rose' | 'violet';

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return parts.slice(0, 2).map((p) => p[0]!.toUpperCase()).join('') || '?';
}

export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? '';
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export function formatDuration(start: string | null | undefined, end: string | null | undefined): string {
  if (!start || !end) return '—';
  const mins = Math.round((Date.parse(end) - Date.parse(start)) / 60000);
  if (Number.isNaN(mins)) return '—';
  return mins < 1 ? '< 1 min' : `${mins} min`;
}

export function formatClock(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

const RECOMMENDATIONS: Record<string, { label: string; tone: Tone }> = {
  strong_yes: { label: 'Strong hire', tone: 'emerald' },
  yes: { label: 'Hire', tone: 'teal' },
  maybe: { label: 'Consider', tone: 'amber' },
  no: { label: 'Not a fit', tone: 'rose' },
};

export function recommendationMeta(rec: string | null | undefined) {
  return rec ? RECOMMENDATIONS[rec] ?? { label: rec, tone: 'slate' as Tone } : null;
}

const STATUSES: Record<string, { label: string; tone: Tone }> = {
  created: { label: 'Not started', tone: 'slate' },
  in_progress: { label: 'In progress', tone: 'amber' },
  completed: { label: 'Completed', tone: 'emerald' },
};

export function statusMeta(status: string) {
  return STATUSES[status] ?? { label: status, tone: 'slate' as Tone };
}

/** Colour for a 0-100 score. */
export function scoreColor(score: number): string {
  if (score >= 65) return '#10b981';
  if (score >= 45) return '#f59e0b';
  return '#f43f5e';
}

/** Tailwind background class for a 1-5 competency score. */
export function scoreBarClass(score: number): string {
  if (score >= 4) return 'bg-emerald-500';
  if (score === 3) return 'bg-amber-400';
  return 'bg-rose-500';
}
