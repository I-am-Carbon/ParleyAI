import { useEffect, useRef, useState } from 'react';
import { api, Job } from '../api/client';
import {
  IconArrowLeft,
  IconArrowRight,
  IconBriefcase,
  IconCheck,
  IconClock,
  IconFile,
  IconGlobe,
  IconGraduation,
  IconHeadphones,
  IconMic,
  IconSearch,
  IconShieldCheck,
  IconTrash,
  IconUpload,
} from '../components/icons';
import ProcessingOverlay from '../components/ProcessingOverlay';
import { Alert, Button, Card, Skeleton, cn } from '../components/ui';
import { INTERVIEWER_NAME } from '../lib/brand';
import { EXPERIENCE_LEVELS, levelLabel, type ExperienceLevel } from '../lib/format';

interface Props {
  onBack: () => void;
  onCreated: (id: number) => void;
}

const ACCEPTED = ['.pdf', '.docx', '.txt'];

export default function NewInterview({ onBack, onCreated }: Props) {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [jobId, setJobId] = useState<number | ''>('');
  const [mode, setMode] = useState<'recruiter' | 'practice'>('recruiter');
  const [level, setLevel] = useState<ExperienceLevel | ''>('');
  const [resume, setResume] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [roleQuery, setRoleQuery] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api.jobs
      .list()
      .then((js) => {
        setJobs(js);
        if (js.length > 0) setJobId(js[0].id);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const pickFile = (file: File | undefined | null) => {
    if (!file) return;
    if (!ACCEPTED.some((ext) => file.name.toLowerCase().endsWith(ext))) {
      setError('Please upload a PDF, DOCX or TXT file.');
      return;
    }
    setError('');
    setResume(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!jobId || !level || !resume) {
      setError('Please choose a role and your experience level, and upload your resume.');
      return;
    }

    setSubmitting(true);
    try {
      const data = await api.interviews.create(jobId as number, mode, level, resume);
      onCreated(data.id);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  const selectedJob = jobs.find((j) => j.id === jobId);
  const q = roleQuery.trim().toLowerCase();
  const visibleJobs = q
    ? jobs.filter((j) => [j.title, j.description, ...j.competencies.map((c) => c.name)].some((s) => s.toLowerCase().includes(q)))
    : jobs;

  return (
    <div className="animate-fade-up">
      {submitting && (
        <ProcessingOverlay
          title="Preparing your interview"
          subtitle="This usually takes 10–20 seconds."
          steps={['Reading your resume', 'Matching your experience to the role', 'Writing personalised questions', `Getting ${INTERVIEWER_NAME} ready`]}
        />
      )}

      <button onClick={onBack} className="mb-6 inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 transition hover:text-slate-900">
        <IconArrowLeft className="h-4 w-4" /> Back to dashboard
      </button>

      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">Set up your interview</h1>
        <p className="mt-1.5 text-slate-500">
          Four quick steps. {INTERVIEWER_NAME} will tailor every question to your resume, the role and your experience level.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {error && <Alert onClose={() => setError('')}>{error}</Alert>}

          {/* Step 1: role */}
          <Section step={1} title="Choose a role" description="The competencies you'll be assessed on come from the role.">
            {loading ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <Skeleton className="h-36 rounded-xl" />
                <Skeleton className="h-36 rounded-xl" />
              </div>
            ) : (
              <>
              {jobs.length > 6 && (
                <div className="relative mb-4">
                  <IconSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    value={roleQuery}
                    onChange={(e) => setRoleQuery(e.target.value)}
                    placeholder={`Search ${jobs.length} roles, e.g. ML, DevOps, data`}
                    className="h-10 w-full rounded-lg border-0 bg-white pl-9 pr-3 text-sm text-slate-900 ring-1 ring-inset ring-slate-200 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              )}
              {visibleJobs.length === 0 && <p className="py-6 text-center text-sm text-slate-500">No roles match “{roleQuery}”.</p>}
              <div className="grid gap-3 sm:grid-cols-2" role="radiogroup">
                {visibleJobs.map((j) => {
                  const active = j.id === jobId;
                  return (
                    <button
                      type="button"
                      role="radio"
                      aria-checked={active}
                      key={j.id}
                      onClick={() => setJobId(j.id)}
                      className={cn(
                        'relative flex flex-col rounded-xl p-4 text-left ring-1 ring-inset transition-all',
                        active ? 'bg-indigo-50/60 ring-2 ring-indigo-500' : 'bg-white ring-slate-200 hover:bg-slate-50 hover:ring-slate-300',
                      )}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className={cn('grid h-9 w-9 place-items-center rounded-lg', active ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-500')}>
                          <IconBriefcase className="h-[18px] w-[18px]" />
                        </div>
                        <span
                          className={cn(
                            'grid h-5 w-5 place-items-center rounded-full ring-1 ring-inset transition',
                            active ? 'bg-indigo-600 text-white ring-indigo-600' : 'ring-slate-300',
                          )}
                        >
                          {active && <IconCheck className="h-3 w-3" strokeWidth={3} />}
                        </span>
                      </div>
                      <div className="mt-3 font-medium text-slate-900">{j.title}</div>
                      <p className="mt-1 line-clamp-2 text-sm text-slate-500">{j.description}</p>
                      {j.competencies.length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-1.5">
                          {j.competencies.slice(0, 3).map((c) => (
                            <span key={c.name} className="rounded-md bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                              {c.name}
                            </span>
                          ))}
                          {j.competencies.length > 3 && (
                            <span className="rounded-md px-1 py-0.5 text-xs text-slate-400">+{j.competencies.length - 3} more</span>
                          )}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
              </>
            )}
          </Section>

          {/* Step 2: experience level */}
          <Section step={2} title="Your experience level" description="Questions and scoring are pitched at this level.">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4" role="radiogroup">
              {EXPERIENCE_LEVELS.map((l) => {
                const active = level === l.value;
                return (
                  <button
                    type="button"
                    role="radio"
                    aria-checked={active}
                    key={l.value}
                    onClick={() => setLevel(l.value)}
                    className={cn(
                      'flex flex-col rounded-xl p-4 text-left ring-1 ring-inset transition-all',
                      active ? 'bg-indigo-50/60 ring-2 ring-indigo-500' : 'bg-white ring-slate-200 hover:bg-slate-50 hover:ring-slate-300',
                    )}
                  >
                    <span className={cn('text-xs font-semibold uppercase tracking-wider', active ? 'text-indigo-600' : 'text-slate-400')}>
                      {l.years}
                    </span>
                    <span className="mt-1 font-medium text-slate-900">{l.label}</span>
                    <span className="mt-1 text-xs leading-relaxed text-slate-500">{l.text}</span>
                  </button>
                );
              })}
            </div>
          </Section>

          {/* Step 3: resume */}
          <Section step={3} title="Upload your resume" description="PDF, DOCX or TXT. Questions will reference your projects and experience.">
            <input
              ref={fileInput}
              type="file"
              accept={ACCEPTED.join(',')}
              onChange={(e) => pickFile(e.target.files?.[0])}
              className="hidden"
              id="resume-input"
            />
            {resume ? (
              <div className="flex items-center gap-4 rounded-xl bg-emerald-50/60 p-4 ring-1 ring-inset ring-emerald-200">
                <div className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-white text-emerald-600 shadow-sm ring-1 ring-emerald-100">
                  <IconFile className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium text-slate-900">{resume.name}</div>
                  <div className="text-sm text-slate-500">{(resume.size / 1024).toFixed(0)} KB · Ready to upload</div>
                </div>
                <Button variant="ghost" size="sm" onClick={() => fileInput.current?.click()}>
                  Replace
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label="Remove file"
                  onClick={() => {
                    setResume(null);
                    if (fileInput.current) fileInput.current.value = '';
                  }}
                >
                  <IconTrash />
                </Button>
              </div>
            ) : (
              <label
                htmlFor="resume-input"
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragging(false);
                  pickFile(e.dataTransfer.files?.[0]);
                }}
                className={cn(
                  'flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-10 text-center transition',
                  dragging ? 'border-indigo-500 bg-indigo-50/60' : 'border-slate-200 hover:border-indigo-300 hover:bg-slate-50',
                )}
              >
                <div className="grid h-12 w-12 place-items-center rounded-xl bg-indigo-50 text-indigo-600 ring-1 ring-indigo-100">
                  <IconUpload className="h-5 w-5" />
                </div>
                <div className="mt-4 text-sm">
                  <span className="font-semibold text-indigo-600">Click to upload</span>
                  <span className="text-slate-500"> or drag and drop</span>
                </div>
                <div className="mt-1 text-xs text-slate-400">PDF, DOCX or TXT</div>
              </label>
            )}
          </Section>

          {/* Step 4: mode */}
          <Section step={4} title="Choose a mode" description="You can practice as many times as you like.">
            <div className="grid gap-3 sm:grid-cols-2" role="radiogroup">
              {(
                [
                  {
                    value: 'recruiter',
                    icon: IconShieldCheck,
                    title: 'Recruiter interview',
                    text: 'The real thing. Sent to the hiring team, with camera-based attention monitoring.',
                  },
                  {
                    value: 'practice',
                    icon: IconGraduation,
                    title: 'Practice session',
                    text: 'Low stakes. Get coaching-style feedback just for you.',
                  },
                ] as const
              ).map((m) => {
                const active = mode === m.value;
                return (
                  <button
                    type="button"
                    role="radio"
                    aria-checked={active}
                    key={m.value}
                    onClick={() => setMode(m.value)}
                    className={cn(
                      'flex gap-3 rounded-xl p-4 text-left ring-1 ring-inset transition-all',
                      active ? 'bg-indigo-50/60 ring-2 ring-indigo-500' : 'bg-white ring-slate-200 hover:bg-slate-50 hover:ring-slate-300',
                    )}
                  >
                    <div className={cn('grid h-9 w-9 shrink-0 place-items-center rounded-lg', active ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-500')}>
                      <m.icon className="h-[18px] w-[18px]" />
                    </div>
                    <div>
                      <div className="font-medium text-slate-900">{m.title}</div>
                      <p className="mt-0.5 text-sm text-slate-500">{m.text}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </Section>
        </div>

        {/* Summary */}
        <div className="lg:col-span-1">
          <div className="space-y-4 lg:sticky lg:top-24">
            <Card className="p-6">
              <h3 className="text-[15px] font-semibold text-slate-900">Interview summary</h3>
              <dl className="mt-5 space-y-4 text-sm">
                <SummaryRow label="Role" value={selectedJob?.title} />
                <SummaryRow label="Experience" value={levelLabel(level) ?? undefined} />
                <SummaryRow label="Resume" value={resume?.name} />
                <SummaryRow label="Mode" value={mode === 'practice' ? 'Practice session' : 'Recruiter interview'} />
                <SummaryRow label="Duration" value="About 15–20 minutes" icon={<IconClock className="h-3.5 w-3.5 text-slate-400" />} />
              </dl>
              <Button type="submit" size="lg" className="mt-6 w-full" loading={submitting} disabled={!jobId || !level || !resume}>
                {submitting ? 'Preparing…' : 'Create & start interview'}
                {!submitting && <IconArrowRight />}
              </Button>
              {(!jobId || !level || !resume) && (
                <p className="mt-3 text-center text-xs text-slate-400">
                  {!level ? 'Choose your experience level to continue.' : 'Upload your resume to continue.'}
                </p>
              )}
            </Card>

            <Card className="p-6">
              <h3 className="text-sm font-semibold text-slate-900">Before you begin</h3>
              <ul className="mt-4 space-y-3 text-sm text-slate-600">
                {[
                  [IconHeadphones, 'Find a quiet place. Headphones help.'],
                  [IconMic, 'Allow microphone access when asked.'],
                  [IconGlobe, 'Use Chrome or Edge for voice answers.'],
                ].map(([Ic, text]) => {
                  const I = Ic as typeof IconMic;
                  return (
                    <li key={text as string} className="flex gap-3">
                      <I className="mt-0.5 h-4 w-4 shrink-0 text-indigo-500" />
                      {text as string}
                    </li>
                  );
                })}
              </ul>
            </Card>
          </div>
        </div>
      </form>
    </div>
  );
}

function Section({ step, title, description, children }: { step: number; title: string; description: string; children: React.ReactNode }) {
  return (
    <Card className="p-6">
      <div className="mb-5 flex items-start gap-3">
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-slate-900 text-xs font-semibold text-white">{step}</span>
        <div>
          <h2 className="text-[15px] font-semibold text-slate-900">{title}</h2>
          <p className="mt-0.5 text-sm text-slate-500">{description}</p>
        </div>
      </div>
      {children}
    </Card>
  );
}

function SummaryRow({ label, value, icon }: { label: string; value?: string; icon?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <dt className="text-slate-500">{label}</dt>
      <dd className={cn('flex min-w-0 items-center gap-1.5 text-right font-medium', value ? 'text-slate-900' : 'text-slate-300')}>
        {icon}
        <span className="truncate">{value ?? 'Not selected'}</span>
      </dd>
    </div>
  );
}
