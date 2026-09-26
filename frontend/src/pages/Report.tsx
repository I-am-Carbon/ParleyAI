import { useEffect, useState } from 'react';
import { api, Report, session } from '../api/client';
import {
  IconArrowLeft,
  IconBriefcase,
  IconCalendar,
  IconCheckCircle,
  IconClock,
  IconEyeOff,
  IconFile,
  IconGraduation,
  IconLock,
  IconMessage,
  IconPrinter,
  IconSend,
  IconX,
  IconShieldAlert,
  IconShieldCheck,
  IconSparkles,
  IconTarget,
  IconUserX,
  IconUsers,
  IconVideoOff,
  IconWindow,
  type Icon,
} from '../components/icons';
import { Alert, Avatar, Badge, Button, Card, CardHeader, EmptyState, ScoreRing, Skeleton, cn } from '../components/ui';
import { INTERVIEWER_NAME } from '../lib/brand';
import { formatClock, formatDate, formatDuration, levelLabel, recommendationMeta, scoreBarClass } from '../lib/format';

interface Props {
  id: number;
  onBack: () => void;
}

type Tab = 'overview' | 'transcript' | 'integrity';

const EVENT_META: Record<string, { label: string; icon: Icon; bar: string; text: string }> = {
  looking_away: { label: 'Looked away', icon: IconEyeOff, bar: 'bg-amber-400', text: 'text-amber-600' },
  no_face: { label: 'Face not visible', icon: IconUserX, bar: 'bg-orange-500', text: 'text-orange-600' },
  multiple_faces: { label: 'Multiple faces', icon: IconUsers, bar: 'bg-rose-500', text: 'text-rose-600' },
  tab_hidden: { label: 'Left the tab', icon: IconWindow, bar: 'bg-violet-500', text: 'text-violet-600' },
  camera_off: { label: 'Camera off', icon: IconVideoOff, bar: 'bg-slate-500', text: 'text-slate-600' },
};

export default function ReportPage({ id, onBack }: Props) {
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<Tab>('overview');
  const [sharing, setSharing] = useState(false);

  useEffect(() => {
    api.reports
      .get(id)
      .then(setReport)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-48 w-full rounded-2xl" />
        <div className="grid gap-6 lg:grid-cols-3">
          <Skeleton className="h-96 rounded-2xl lg:col-span-2" />
          <Skeleton className="h-96 rounded-2xl" />
        </div>
      </div>
    );
  }

  if (!report) {
    return (
      <div className="space-y-6">
        <BackLink onClick={onBack} />
        <Alert>{error || 'Report not found'}</Alert>
      </div>
    );
  }

  const r = report.report;
  const practice = report.mode === 'practice';
  const isRecruiter = session.role() === 'recruiter';
  const rec = recommendationMeta(r.recommendation);
  const answered = report.transcript.filter((t) => t.answer_transcript !== null);

  const tabs: Array<{ key: Tab; label: string; icon: Icon }> = [
    { key: 'overview', label: 'Overview', icon: IconSparkles },
    { key: 'transcript', label: 'Transcript', icon: IconMessage },
    ...(r.integrity_summary.enabled ? [{ key: 'integrity' as Tab, label: 'Integrity', icon: IconShieldCheck }] : []),
  ];

  const toggleShare = async () => {
    setSharing(true);
    setError('');
    try {
      const res = await api.interviews.share(report.interview_id, !report.results_shared);
      setReport({ ...report, results_shared: res.results_shared });
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSharing(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-up">
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <BackLink onClick={onBack} />
        <div className="flex items-center gap-2">
          {isRecruiter && !practice && (
            <Button variant={report.results_shared ? 'secondary' : 'primary'} size="sm" onClick={toggleShare} loading={sharing}>
              {report.results_shared ? (
                <>
                  <IconX /> Stop sharing
                </>
              ) : (
                <>
                  <IconSend /> Share with candidate
                </>
              )}
            </Button>
          )}
          <Button variant="secondary" size="sm" onClick={() => window.print()}>
            <IconPrinter /> Export PDF
          </Button>
        </div>
      </div>

      {error && <Alert onClose={() => setError('')}>{error}</Alert>}

      {isRecruiter && report.end_reason && (
        <div className="flex items-start gap-3 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-900 ring-1 ring-inset ring-rose-200">
          <IconShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
          <span>
            <strong className="font-semibold">Ended automatically by attention monitoring.</strong>{' '}
            {report.end_reason === 'multiple_faces'
              ? 'More than one person was in view for more than 5 seconds.'
              : report.end_reason === 'no_face'
                ? "The candidate's face was not visible for more than 5 seconds."
                : 'The candidate looked away from the screen for more than 5 seconds.'}{' '}
            Scores cover only the answers given before that. See the Integrity tab for the timeline.
          </span>
        </div>
      )}

      {isRecruiter && !practice && (
        <div
          className={cn(
            'no-print flex items-start gap-3 rounded-xl px-4 py-3 text-sm ring-1 ring-inset',
            report.results_shared ? 'bg-emerald-50 text-emerald-900 ring-emerald-200' : 'bg-slate-100/80 text-slate-700 ring-slate-200',
          )}
        >
          {report.results_shared ? <IconCheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /> : <IconLock className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />}
          <span>
            {report.results_shared
              ? `${report.candidate.name} can now see their score, competency breakdown and feedback. Integrity observations stay private to your team.`
              : `Only your hiring team can see these results. Share them to let ${report.candidate.name} see their score and feedback. Integrity observations are never shared.`}
          </span>
        </div>
      )}

      {/* Hero */}
      <Card className="relative overflow-hidden">
        <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-gradient-to-br from-indigo-200/50 via-violet-200/40 to-fuchsia-200/30 blur-3xl" />
        <div className="relative grid gap-8 p-6 sm:p-8 md:grid-cols-[1fr_auto] md:items-center">
          <div className="min-w-0">
            <div className="text-xs font-medium uppercase tracking-wider text-indigo-600">
              {practice ? 'Practice feedback' : isRecruiter ? 'Evaluation report' : 'Your interview results'}
            </div>
            <div className="mt-3 flex items-center gap-4">
              <Avatar name={report.candidate.name} size="lg" className="ring-4 ring-indigo-50" />
              <div className="min-w-0">
                <h1 className="truncate text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">{report.candidate.name}</h1>
                <div className="mt-1 flex items-center gap-1.5 text-slate-500">
                  <IconBriefcase className="h-4 w-4 shrink-0" />
                  <span className="truncate">{report.job.title}</span>
                </div>
              </div>
            </div>
            <div className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-sm text-slate-500">
              <Meta icon={IconCalendar}>{formatDate(report.started_at)}</Meta>
              <Meta icon={IconClock}>{formatDuration(report.started_at, report.ended_at)}</Meta>
              <Meta icon={IconMessage}>
                {answered.length} answer{answered.length === 1 ? '' : 's'}
              </Meta>
              <Meta icon={IconFile}>{practice ? 'Practice session' : 'Recruiter interview'}</Meta>
              {levelLabel(report.experience_level) && <Meta icon={IconGraduation}>{levelLabel(report.experience_level)}</Meta>}
            </div>
          </div>

          <div className="flex items-center gap-6 rounded-2xl bg-slate-50/80 p-5 ring-1 ring-inset ring-slate-100 md:flex-col md:gap-3 md:px-8">
            <ScoreRing value={r.overall_score} size={132} stroke={11} />
            <div className="space-y-2 md:text-center">
              <div className="text-xs font-medium uppercase tracking-wider text-slate-500">Overall score</div>
              {rec && (
                <Badge tone={rec.tone} dot className="px-3 py-1 text-sm">
                  {rec.label}
                </Badge>
              )}
            </div>
          </div>
        </div>
      </Card>

      {/* Tabs */}
      <div className="no-print inline-flex rounded-xl bg-slate-200/60 p-1">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              'inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition',
              tab === t.key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-900',
            )}
          >
            <t.icon className="h-4 w-4" />
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <div className="grid gap-6 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader icon={IconTarget} title="Competency breakdown" description="Scored 1–5 from what was said in the interview, with supporting quotes." />
            <div className="divide-y divide-slate-100 px-6">
              {r.competency_scores.map((c) => (
                <div key={c.competency} className="py-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <h4 className="font-medium text-slate-900">{c.competency}</h4>
                      {c.comment && <p className="mt-1 text-sm leading-relaxed text-slate-500">{c.comment}</p>}
                    </div>
                    <div className="flex shrink-0 items-baseline gap-0.5">
                      <span className="text-2xl font-semibold tabular-nums text-slate-900">{c.score}</span>
                      <span className="text-sm text-slate-400">/5</span>
                    </div>
                  </div>
                  <div className="mt-3 flex gap-1">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <div key={n} className={cn('h-2 flex-1 rounded-full', n <= c.score ? scoreBarClass(c.score) : 'bg-slate-100')} />
                    ))}
                  </div>
                  {c.evidence.length > 0 && (
                    <div className="mt-4 space-y-2">
                      {c.evidence.map((quote) => (
                        <blockquote key={quote} className="rounded-lg border-l-2 border-indigo-300 bg-slate-50 px-4 py-2.5 text-sm italic leading-relaxed text-slate-600">
                          “{quote}”
                        </blockquote>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </Card>

          <div className="space-y-6">
            <div className="rounded-2xl bg-gradient-to-br from-indigo-600 via-violet-600 to-fuchsia-600 p-[1px] shadow-lg shadow-indigo-500/10">
              <div className="rounded-[15px] bg-white p-6">
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                  <span className="grid h-7 w-7 place-items-center rounded-lg bg-gradient-to-br from-indigo-500 to-fuchsia-500 text-white">
                    <IconSparkles className="h-4 w-4" />
                  </span>
                  {practice ? 'Coaching summary' : 'AI summary'}
                </div>
                <p className="mt-3 text-sm leading-relaxed text-slate-600">{r.summary}</p>
              </div>
            </div>

            <ListCard title="Strengths" icon={IconCheckCircle} tone="emerald" items={r.strengths} />
            <ListCard title={practice ? 'Where to improve' : 'Gaps & risks'} icon={IconTarget} tone="amber" items={r.gaps} />
          </div>
        </div>
      )}

      {tab === 'transcript' && (
        <Card>
          <CardHeader icon={IconMessage} title="Interview transcript" description="Each answer shows the interviewer's score for that answer." />
          {answered.length === 0 ? (
            <EmptyState icon={IconMessage} title="No answers recorded" description="The interview ended before any questions were answered." />
          ) : (
            <ol className="divide-y divide-slate-100">
              {answered.map((t, i) => (
                <li key={t.idx} className="px-6 py-6">
                  <div className="flex items-center justify-between gap-4">
                    <Badge tone="indigo">
                      Q{i + 1} · {t.topic}
                    </Badge>
                    {t.eval && (
                      <span className="inline-flex items-center gap-2 text-sm">
                        <span className="flex gap-0.5">
                          {[1, 2, 3, 4, 5].map((n) => (
                            <span key={n} className={cn('h-1.5 w-3 rounded-full', n <= t.eval.answer_score ? scoreBarClass(t.eval.answer_score) : 'bg-slate-100')} />
                          ))}
                        </span>
                        <span className="font-medium tabular-nums text-slate-700">{t.eval.answer_score}/5</span>
                      </span>
                    )}
                  </div>
                  <div className="mt-4 flex gap-3">
                    <div className="mt-0.5 h-7 w-7 shrink-0 rounded-full bg-gradient-to-br from-indigo-500 via-violet-500 to-fuchsia-500" />
                    <div className="min-w-0">
                      <div className="text-xs font-medium text-slate-400">{INTERVIEWER_NAME}</div>
                      <p className="mt-0.5 font-medium leading-relaxed text-slate-900">{t.question}</p>
                    </div>
                  </div>
                  <div className="mt-4 flex gap-3">
                    <Avatar name={report.candidate.name} size="sm" className="h-7 w-7 text-[10px] ring-0" />
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-medium text-slate-400">{report.candidate.name}</div>
                      <p className="mt-0.5 leading-relaxed text-slate-600">{t.answer_transcript}</p>
                      {t.eval?.signals?.length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-1.5">
                          {t.eval.signals.map((s: string) => (
                            <span key={s} className="rounded-md bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                              {s}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </Card>
      )}

      {tab === 'integrity' && <IntegrityPanel report={report} />}
    </div>
  );
}

/* ---------- Integrity ---------- */

function IntegrityPanel({ report }: { report: Report }) {
  const s = report.report.integrity_summary;
  if (!s.enabled) {
    return (
      <Card>
        <EmptyState icon={IconShieldCheck} title="Integrity monitoring is off" description={s.note} />
      </Card>
    );
  }

  const events = report.integrity_events;
  const flags = s.flags ?? [];
  const risk = s.risk_level ?? 'low';
  const riskStyle = {
    low: { tone: 'emerald' as const, label: 'Low', icon: IconShieldCheck, ring: 'from-emerald-50 to-teal-50 text-emerald-600 ring-emerald-100' },
    medium: { tone: 'amber' as const, label: 'Medium', icon: IconShieldAlert, ring: 'from-amber-50 to-orange-50 text-amber-600 ring-amber-100' },
    high: { tone: 'rose' as const, label: 'High', icon: IconShieldAlert, ring: 'from-rose-50 to-pink-50 text-rose-600 ring-rose-100' },
  }[risk] ?? { tone: 'slate' as const, label: risk, icon: IconShieldAlert, ring: 'from-slate-50 to-slate-100 text-slate-600 ring-slate-100' };
  const totalMs =
    s.session_seconds && s.session_seconds > 0
      ? s.session_seconds * 1000
      : Math.max(1, ...events.map((e) => e.started_at_ms + e.duration_ms));

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="p-6">
          <div className="flex items-center gap-4">
            <div className={cn('grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br ring-1', riskStyle.ring)}>
              <riskStyle.icon className="h-6 w-6" />
            </div>
            <div>
              <div className="text-sm text-slate-500">Attention risk</div>
              <div className="text-2xl font-semibold text-slate-900">{riskStyle.label}</div>
            </div>
          </div>
          <div className="mt-6 space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-500">Time away or off-camera</span>
              <span className="font-medium tabular-nums text-slate-900">{s.away_percent ?? 0}%</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
              <div className={cn('h-full rounded-full', scoreBarClass(risk === 'low' ? 5 : risk === 'medium' ? 3 : 1))} style={{ width: `${Math.min(100, s.away_percent ?? 0)}%` }} />
            </div>
          </div>
        </Card>

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:col-span-2">
          {Object.entries(EVENT_META).map(([type, meta]) => {
            const stats = s.by_type?.[type] ?? { count: 0, total_seconds: 0 };
            return (
              <Card key={type} className="p-5">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-slate-500">{meta.label}</span>
                  <meta.icon className={cn('h-4 w-4', stats.count ? meta.text : 'text-slate-300')} />
                </div>
                <div className="mt-2 text-2xl font-semibold tabular-nums text-slate-900">{stats.count}</div>
                <div className="text-xs text-slate-400">{stats.total_seconds}s total</div>
              </Card>
            );
          })}
        </div>
      </div>

      <Card>
        <CardHeader icon={IconClock} title="Session timeline" description="When attention events happened during the interview." />
        <div className="px-6 py-6">
          <div className="relative h-10 overflow-hidden rounded-lg bg-slate-100">
            {events.map((e, i) => {
              const meta = EVENT_META[e.type];
              return (
                <div
                  key={i}
                  title={`${meta?.label ?? e.type} at ${formatClock(e.started_at_ms)} (${(e.duration_ms / 1000).toFixed(1)}s)`}
                  className={cn('absolute bottom-1.5 top-1.5 rounded', meta?.bar ?? 'bg-slate-400')}
                  style={{ left: `${Math.min(99, (e.started_at_ms / totalMs) * 100)}%`, width: `max(4px, ${(e.duration_ms / totalMs) * 100}%)` }}
                />
              );
            })}
          </div>
          <div className="mt-2 flex justify-between text-xs tabular-nums text-slate-400">
            <span>00:00</span>
            <span>{formatClock(totalMs)}</span>
          </div>
          <div className="mt-4 flex flex-wrap gap-4 text-xs text-slate-500">
            {Object.values(EVENT_META).map((m) => (
              <span key={m.label} className="inline-flex items-center gap-1.5">
                <span className={cn('h-2.5 w-2.5 rounded-sm', m.bar)} />
                {m.label}
              </span>
            ))}
          </div>
          {events.length === 0 && <p className="mt-4 text-sm text-slate-500">No attention events were recorded.</p>}
        </div>
      </Card>

      <Card className="p-6">
        <h3 className="text-[15px] font-semibold text-slate-900">Observations</h3>
        {flags.length > 0 ? (
          <ul className="mt-4 space-y-3">
            {flags.map((f) => (
              <li key={f} className="flex gap-3 text-sm text-slate-700">
                <IconShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                {f}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 flex items-center gap-2 text-sm text-slate-600">
            <IconCheckCircle className="h-4 w-4 text-emerald-500" /> Nothing unusual was observed.
          </p>
        )}
        <Alert tone="info" className="mt-5">
          {s.note}
        </Alert>
      </Card>
    </div>
  );
}

/* ---------- Pieces ---------- */

function BackLink({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 transition hover:text-slate-900">
      <IconArrowLeft className="h-4 w-4" /> Back to dashboard
    </button>
  );
}

function Meta({ icon: IconCmp, children }: { icon: Icon; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <IconCmp className="h-4 w-4 text-slate-400" />
      {children}
    </span>
  );
}

function ListCard({ title, icon: IconCmp, tone, items }: { title: string; icon: Icon; tone: 'emerald' | 'amber'; items: string[] }) {
  const styles = tone === 'emerald' ? { chip: 'bg-emerald-50 text-emerald-600', dot: 'bg-emerald-500' } : { chip: 'bg-amber-50 text-amber-600', dot: 'bg-amber-500' };
  return (
    <Card className="p-6">
      <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
        <span className={cn('grid h-7 w-7 place-items-center rounded-lg', styles.chip)}>
          <IconCmp className="h-4 w-4" />
        </span>
        {title}
      </div>
      <ul className="mt-4 space-y-3">
        {items.map((item) => (
          <li key={item} className="flex gap-3 text-sm leading-relaxed text-slate-600">
            <span className={cn('mt-2 h-1.5 w-1.5 shrink-0 rounded-full', styles.dot)} />
            {item}
          </li>
        ))}
      </ul>
    </Card>
  );
}
