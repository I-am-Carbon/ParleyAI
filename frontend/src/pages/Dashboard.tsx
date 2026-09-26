import { useEffect, useState } from 'react';
import { api, Interview, session } from '../api/client';
import {
  IconArrowRight,
  IconBriefcase,
  IconCheckCircle,
  IconClipboard,
  IconGauge,
  IconMic,
  IconPlay,
  IconPlus,
  IconTrendingUp,
  IconUpload,
  type Icon,
} from '../components/icons';
import { Alert, Badge, Button, Card, EmptyState, Skeleton } from '../components/ui';
import { INTERVIEWER_NAME } from '../lib/brand';
import { firstName, formatDate, recommendationMeta, scoreColor, statusMeta } from '../lib/format';

interface Props {
  onNew: () => void;
  onInterview: (id: number) => void;
  onReport: (id: number) => void;
}

export default function Dashboard({ onNew, onInterview, onReport }: Props) {
  const [interviews, setInterviews] = useState<Interview[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    api.interviews
      .list()
      .then(setInterviews)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const name = firstName(session.name());
  const scored = interviews.filter((i) => i.overall_score !== null).map((i) => i.overall_score as number);
  const avg = scored.length ? Math.round(scored.reduce((a, b) => a + b, 0) / scored.length) : null;
  const best = scored.length ? Math.max(...scored) : null;
  const completed = interviews.filter((i) => i.status === 'completed').length;

  return (
    <div className="space-y-8 animate-fade-up">
      {/* Heading */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
            {name ? `Welcome back, ${name}` : 'Welcome back'}
          </h1>
          <p className="mt-1.5 text-slate-500">Track your interviews, pick up where you left off and review your feedback.</p>
        </div>
        <Button onClick={onNew} size="lg">
          <IconPlus /> New interview
        </Button>
      </div>

      {error && <Alert onClose={() => setError('')}>{error}</Alert>}

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard icon={IconClipboard} label="Total interviews" value={loading ? null : String(interviews.length)} />
        <StatCard icon={IconCheckCircle} label="Completed" value={loading ? null : String(completed)} />
        <StatCard icon={IconGauge} label="Average score" value={loading ? null : avg !== null ? String(avg) : '—'} suffix={avg !== null ? '/100' : ''} />
        <StatCard icon={IconTrendingUp} label="Best score" value={loading ? null : best !== null ? String(best) : '—'} suffix={best !== null ? '/100' : ''} />
      </div>

      {/* Interviews */}
      <Card className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <div>
            <h2 className="text-[15px] font-semibold text-slate-900">Your interviews</h2>
            <p className="text-sm text-slate-500">Most recent first</p>
          </div>
          {!loading && interviews.length > 0 && <Badge>{interviews.length} total</Badge>}
        </div>

        {loading ? (
          <div className="divide-y divide-slate-100">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex items-center gap-4 px-6 py-5">
                <Skeleton className="h-10 w-10 rounded-xl" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-48" />
                  <Skeleton className="h-3 w-24" />
                </div>
                <Skeleton className="h-8 w-24" />
              </div>
            ))}
          </div>
        ) : interviews.length === 0 ? (
          <EmptyState
            icon={IconMic}
            title="No interviews yet"
            description={
              <>
                Upload your resume, pick a role, and have a spoken conversation with {INTERVIEWER_NAME}, your AI interviewer. It takes
                about 15 minutes.
              </>
            }
            action={
              <div className="flex flex-col items-center gap-6">
                <Button onClick={onNew} size="lg">
                  <IconPlus /> Start your first interview
                </Button>
                <ol className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-slate-500">
                  {[
                    [IconBriefcase, 'Choose a role'],
                    [IconUpload, 'Upload resume'],
                    [IconMic, `Talk to ${INTERVIEWER_NAME}`],
                  ].map(([Ic, label], i) => {
                    const I = Ic as Icon;
                    return (
                      <li key={label as string} className="flex items-center gap-2">
                        <span className="grid h-6 w-6 place-items-center rounded-full bg-slate-100 text-xs font-semibold text-slate-600">{i + 1}</span>
                        <I className="h-4 w-4 text-slate-400" />
                        {label as string}
                      </li>
                    );
                  })}
                </ol>
              </div>
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="bg-slate-50/60 text-left text-xs font-medium uppercase tracking-wider text-slate-500">
                  <th className="px-6 py-3">Role</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Score</th>
                  <th className="px-4 py-3">Result</th>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-6 py-3 text-right">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {interviews.map((i) => {
                  // Real interviews are evaluated by the hiring team; the candidate only sees that it was submitted.
                  const submitted = i.status === 'completed' && !i.results_visible;
                  const shared = i.mode === 'recruiter' && i.results_shared && i.results_visible;
                  const status = i.end_reason
                    ? { label: 'Ended early', tone: 'rose' as const }
                    : submitted
                    ? { label: 'Submitted', tone: 'indigo' as const }
                    : shared
                      ? { label: 'Results shared', tone: 'emerald' as const }
                      : statusMeta(i.status);
                  const rec = recommendationMeta(i.recommendation);
                  return (
                    <tr key={i.id} className="group transition-colors hover:bg-slate-50/70">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-indigo-50 to-violet-50 text-indigo-600 ring-1 ring-inset ring-indigo-100">
                            <IconBriefcase className="h-[18px] w-[18px]" />
                          </div>
                          <div className="min-w-0">
                            <div className="truncate font-medium text-slate-900">{i.job_title}</div>
                            <div className="mt-0.5 flex items-center gap-2 text-xs text-slate-500">
                              <span>#{i.id}</span>
                              <span className="h-1 w-1 rounded-full bg-slate-300" />
                              <span>{i.mode === 'practice' ? 'Practice' : 'Recruiter interview'}</span>
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <Badge tone={status.tone} dot pulse={i.status === 'in_progress'}>
                          {status.label}
                        </Badge>
                      </td>
                      <td className="px-4 py-4">
                        {i.overall_score !== null ? (
                          <div className="flex items-center gap-3">
                            <div className="h-1.5 w-20 overflow-hidden rounded-full bg-slate-100">
                              <div className="h-full rounded-full" style={{ width: `${i.overall_score}%`, backgroundColor: scoreColor(i.overall_score) }} />
                            </div>
                            <span className="font-medium tabular-nums text-slate-900">{i.overall_score}</span>
                          </div>
                        ) : submitted ? (
                          <span className="text-xs text-slate-500">Sent to hiring team</span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-4">{rec ? <Badge tone={rec.tone}>{rec.label}</Badge> : <span className="text-slate-400">—</span>}</td>
                      <td className="whitespace-nowrap px-4 py-4 text-slate-500">{formatDate(i.created_at)}</td>
                      <td className="px-6 py-4 text-right">
                        {i.status === 'created' && (
                          <Button size="sm" onClick={() => onInterview(i.id)}>
                            <IconPlay /> Start
                          </Button>
                        )}
                        {i.status === 'in_progress' && (
                          <Button size="sm" variant="secondary" onClick={() => onInterview(i.id)}>
                            Resume <IconArrowRight />
                          </Button>
                        )}
                        {i.status === 'completed' && i.results_visible && i.has_report && (
                          <Button size="sm" variant="secondary" onClick={() => onReport(i.id)}>
                            {shared ? 'View results' : 'View feedback'} <IconArrowRight />
                          </Button>
                        )}
                        {submitted && <span className="text-xs text-slate-400">Under review</span>}
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

function StatCard({ icon: IconCmp, label, value, suffix }: { icon: Icon; label: string; value: string | null; suffix?: string }) {
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
