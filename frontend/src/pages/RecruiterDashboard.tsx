import { useEffect, useMemo, useState } from 'react';
import { api, Interview, session } from '../api/client';
import { IconArrowRight, IconCheckCircle, IconClipboard, IconGauge, IconSearch, IconShieldAlert, IconUsers, type Icon } from '../components/icons';
import { Alert, Avatar, Badge, Button, Card, EmptyState, Skeleton, cn } from '../components/ui';
import { firstName, formatDate, levelLabel, recommendationMeta, scoreColor, statusMeta, type Tone } from '../lib/format';

interface Props {
  onReport: (id: number) => void;
}

type Filter = 'all' | 'completed' | 'in_progress' | 'flagged';

const RISK: Record<string, { label: string; tone: Tone }> = {
  low: { label: 'Low', tone: 'emerald' },
  medium: { label: 'Medium', tone: 'amber' },
  high: { label: 'High', tone: 'rose' },
};

export default function RecruiterDashboard({ onReport }: Props) {
  const [interviews, setInterviews] = useState<Interview[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');

  useEffect(() => {
    api.interviews
      .list()
      .then(setInterviews)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  // Practice sessions are private coaching; recruiters evaluate real interviews.
  const real = useMemo(() => interviews.filter((i) => i.mode === 'recruiter'), [interviews]);
  const scored = real.filter((i) => i.overall_score !== null).map((i) => i.overall_score as number);
  const avg = scored.length ? Math.round(scored.reduce((a, b) => a + b, 0) / scored.length) : null;
  const flagged = real.filter((i) => i.integrity_risk === 'medium' || i.integrity_risk === 'high').length;

  const rows = real.filter((i) => {
    const q = query.trim().toLowerCase();
    const matches = !q || i.candidate_name.toLowerCase().includes(q) || i.job_title.toLowerCase().includes(q) || (i.candidate_email ?? '').toLowerCase().includes(q);
    const inFilter =
      filter === 'all' ||
      (filter === 'completed' && i.status === 'completed') ||
      (filter === 'in_progress' && i.status !== 'completed') ||
      (filter === 'flagged' && (i.integrity_risk === 'medium' || i.integrity_risk === 'high' || !!i.end_reason));
    return matches && inFilter;
  });

  const name = firstName(session.name());

  return (
    <div className="space-y-8 animate-fade-up">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">{name ? `Hi ${name}, here's your pipeline` : 'Candidate pipeline'}</h1>
        <p className="mt-1.5 text-slate-500">Every AI interview, scored against the role's competencies, with attention observations for review.</p>
      </div>

      {error && <Alert onClose={() => setError('')}>{error}</Alert>}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat icon={IconUsers} label="Candidates" value={loading ? null : String(new Set(real.map((i) => i.candidate_name)).size)} />
        <Stat icon={IconCheckCircle} label="Completed interviews" value={loading ? null : String(real.filter((i) => i.status === 'completed').length)} />
        <Stat icon={IconGauge} label="Average score" value={loading ? null : avg !== null ? String(avg) : '—'} suffix={avg !== null ? '/100' : ''} />
        <Stat icon={IconShieldAlert} label="Needs integrity review" value={loading ? null : String(flagged)} />
      </div>

      <Card className="overflow-hidden">
        <div className="flex flex-col gap-4 border-b border-slate-100 px-6 py-4 md:flex-row md:items-center md:justify-between">
          <div className="inline-flex w-fit flex-wrap rounded-lg bg-slate-100 p-1">
            {(
              [
                ['all', 'All'],
                ['completed', 'Completed'],
                ['in_progress', 'In progress'],
                ['flagged', 'Flagged'],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setFilter(key)}
                className={cn(
                  'rounded-md px-3 py-1.5 text-sm font-medium transition',
                  filter === key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-900',
                )}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="relative w-full md:w-72">
            <IconSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search candidates or roles"
              className="h-9 w-full rounded-lg border-0 bg-white pl-9 pr-3 text-sm text-slate-900 ring-1 ring-inset ring-slate-200 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        </div>

        {loading ? (
          <div className="divide-y divide-slate-100">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-4 px-6 py-5">
                <Skeleton className="h-10 w-10 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-3 w-56" />
                </div>
                <Skeleton className="h-8 w-28" />
              </div>
            ))}
          </div>
        ) : rows.length === 0 ? (
          <EmptyState
            icon={IconClipboard}
            title={real.length === 0 ? 'No interviews yet' : 'No matches'}
            description={
              real.length === 0
                ? 'When candidates complete a recruiter interview, their evaluation will appear here.'
                : 'Try a different search or filter.'
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="bg-slate-50/60 text-left text-xs font-medium uppercase tracking-wider text-slate-500">
                  <th className="px-6 py-3">Candidate</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Score</th>
                  <th className="px-4 py-3">Recommendation</th>
                  <th className="px-4 py-3">Integrity</th>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-6 py-3 text-right">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((i) => {
                  const status = statusMeta(i.status);
                  const rec = recommendationMeta(i.recommendation);
                  const risk = i.integrity_risk ? RISK[i.integrity_risk] : null;
                  return (
                    <tr key={i.id} className="transition-colors hover:bg-slate-50/70">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <Avatar name={i.candidate_name} className="ring-slate-100" />
                          <div className="min-w-0">
                            <div className="truncate font-medium text-slate-900">{i.candidate_name}</div>
                            <div className="truncate text-xs text-slate-500">
                              {i.job_title}
                              {levelLabel(i.experience_level) && ` · ${levelLabel(i.experience_level)}`}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        {i.end_reason ? (
                          <Badge tone="rose" dot>
                            Auto-ended
                          </Badge>
                        ) : (
                          <Badge tone={status.tone} dot pulse={i.status === 'in_progress'}>
                            {status.label}
                          </Badge>
                        )}
                      </td>
                      <td className="px-4 py-4">
                        {i.overall_score !== null ? (
                          <div className="flex items-center gap-3">
                            <div className="h-1.5 w-20 overflow-hidden rounded-full bg-slate-100">
                              <div className="h-full rounded-full" style={{ width: `${i.overall_score}%`, backgroundColor: scoreColor(i.overall_score) }} />
                            </div>
                            <span className="font-medium tabular-nums text-slate-900">{i.overall_score}</span>
                          </div>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-4">{rec ? <Badge tone={rec.tone}>{rec.label}</Badge> : <span className="text-slate-400">—</span>}</td>
                      <td className="px-4 py-4">{risk ? <Badge tone={risk.tone}>{risk.label}</Badge> : <span className="text-slate-400">—</span>}</td>
                      <td className="whitespace-nowrap px-4 py-4 text-slate-500">{formatDate(i.created_at)}</td>
                      <td className="px-6 py-4 text-right">
                        {i.has_report ? (
                          <div className="flex items-center justify-end gap-2">
                            {i.results_shared && (
                              <Badge tone="emerald" dot>
                                Shared
                              </Badge>
                            )}
                            <Button size="sm" variant="secondary" onClick={() => onReport(i.id)}>
                              View report <IconArrowRight />
                            </Button>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400">Awaiting completion</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function Stat({ icon: IconCmp, label, value, suffix }: { icon: Icon; label: string; value: string | null; suffix?: string }) {
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-slate-500">{label}</span>
        <div className="grid h-8 w-8 place-items-center rounded-lg bg-slate-50 text-slate-500 ring-1 ring-inset ring-slate-100">
          <IconCmp className="h-4 w-4" />
        </div>
      </div>
      <div className="mt-3 flex items-baseline gap-1">
        {value === null ? (
          <Skeleton className="h-8 w-14" />
        ) : (
          <>
            <span className="text-3xl font-semibold tabular-nums tracking-tight text-slate-900">{value}</span>
            {suffix && <span className="text-sm text-slate-400">{suffix}</span>}
          </>
        )}
      </div>
    </Card>
  );
}
