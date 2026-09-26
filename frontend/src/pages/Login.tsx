import { useState } from 'react';
import { api, session, type Role } from '../api/client';
import { IconArrowRight, IconBriefcase, IconLock, IconMail, IconMessage, IconShieldCheck, IconSparkles, IconUser } from '../components/icons';
import { Alert, Button, Input, Label, Logo, ScoreRing, cn } from '../components/ui';
import { INTERVIEWER_NAME } from '../lib/brand';

interface Props {
  onLogin: () => void;
}

const FEATURES = [
  {
    icon: IconSparkles,
    title: 'Resume-aware questions',
    text: 'Every question is tailored to your experience and the role you are applying for.',
  },
  {
    icon: IconMessage,
    title: 'A real, spoken conversation',
    text: `${INTERVIEWER_NAME} listens, follows up where you shine and adapts when you get stuck.`,
  },
  {
    icon: IconShieldCheck,
    title: 'Fair, evidence-based feedback',
    text: 'Scores are backed by quotes from your own answers, never by guesswork.',
  },
];

export default function Login({ onLogin }: Props) {
  const [tab, setTab] = useState<'signin' | 'signup'>('signin');
  const [role, setRole] = useState<Role>('candidate');
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const isNew = tab === 'signup';

  const switchTab = (t: 'signin' | 'signup') => {
    setTab(t);
    setError('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password || (isNew && !name.trim())) {
      setError('Please fill in all fields.');
      return;
    }
    if (isNew && password.length < 8) {
      setError('Use at least 8 characters for your password.');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const user = isNew
        ? await api.auth.signup({ name: name.trim(), email, password, role, recruiter_code: role === 'recruiter' ? code : undefined })
        : await api.auth.login(email, password);
      session.save(user);
      onLogin();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen bg-white">
      {/* Brand panel */}
      <div className="relative hidden w-[46%] flex-col justify-between overflow-hidden bg-slate-950 p-12 text-white lg:flex">
        <div className="pointer-events-none absolute -left-32 -top-32 h-[480px] w-[480px] rounded-full bg-indigo-600/30 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-40 -right-24 h-[420px] w-[420px] rounded-full bg-fuchsia-600/20 blur-3xl" />
        <div className="bg-grid pointer-events-none absolute inset-0 opacity-40 [mask-image:radial-gradient(ellipse_at_center,black,transparent_75%)]" />

        <div className="relative">
          <Logo dark />
        </div>

        <div className="relative space-y-10">
          <div>
            <h1 className="text-4xl font-semibold leading-[1.1] tracking-tight xl:text-5xl">
              Interviews that feel human.
              <br />
              <span className="bg-gradient-to-r from-indigo-300 via-violet-300 to-fuchsia-300 bg-clip-text text-transparent">
                Insights you can trust.
              </span>
            </h1>
            <p className="mt-5 max-w-md text-[15px] leading-relaxed text-slate-300">
              Practice or take your first-round interview with an AI interviewer that actually listens, then get a clear,
              evidence-backed report.
            </p>
          </div>

          <ul className="space-y-5">
            {FEATURES.map((f) => (
              <li key={f.title} className="flex gap-4">
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/5 ring-1 ring-inset ring-white/10">
                  <f.icon className="h-5 w-5 text-indigo-300" />
                </div>
                <div>
                  <div className="font-medium">{f.title}</div>
                  <div className="mt-0.5 text-sm text-slate-400">{f.text}</div>
                </div>
              </li>
            ))}
          </ul>
        </div>

        {/* Decorative report preview */}
        <div className="relative w-full max-w-sm animate-float rounded-2xl bg-white/[0.06] p-5 ring-1 ring-inset ring-white/10 backdrop-blur" aria-hidden="true">
          <div className="flex items-center gap-4">
            <ScoreRing value={82} size={64} stroke={6} dark />
            <div className="min-w-0 flex-1">
              <div className="text-xs uppercase tracking-wider text-slate-400">Sample report</div>
              <div className="mt-0.5 font-medium">Backend Engineer</div>
              <div className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-emerald-400/10 px-2 py-0.5 text-xs text-emerald-300">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> Strong hire
              </div>
            </div>
          </div>
          <div className="mt-5 space-y-2.5">
            {[
              ['API design', 5],
              ['Problem solving', 4],
              ['Communication', 4],
            ].map(([label, score]) => (
              <div key={label as string} className="flex items-center gap-3 text-xs">
                <span className="w-28 text-slate-400">{label}</span>
                <div className="flex flex-1 gap-1">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <span key={n} className={`h-1.5 flex-1 rounded-full ${n <= (score as number) ? 'bg-indigo-400' : 'bg-white/10'}`} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Form */}
      <div className="flex flex-1 items-center justify-center px-4 py-12 sm:px-12">
        <div className="w-full max-w-sm animate-fade-up">
          <div className="mb-10 lg:hidden">
            <Logo />
          </div>

          <h2 className="text-2xl font-semibold tracking-tight text-slate-900">{isNew ? 'Create your account' : 'Welcome back'}</h2>
          <p className="mt-2 text-sm text-slate-500">
            {isNew ? 'Set up an account to take interviews or review candidates.' : 'Sign in to continue to your dashboard.'}
          </p>

          <div className="mt-8 grid grid-cols-2 rounded-xl bg-slate-100 p-1">
            {(
              [
                ['signin', 'Sign in'],
                ['signup', 'Create account'],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => switchTab(key)}
                className={cn(
                  'rounded-lg py-2 text-sm font-medium transition',
                  tab === key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-900',
                )}
              >
                {label}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="mt-6 space-y-5">
            {error && <Alert onClose={() => setError('')}>{error}</Alert>}

            {isNew && (
              <div className="animate-fade-up">
                <Label>I am a…</Label>
                <div className="grid grid-cols-2 gap-3">
                  {(
                    [
                      ['candidate', 'Candidate', 'Take interviews', IconUser],
                      ['recruiter', 'Recruiter', 'Review candidates', IconBriefcase],
                    ] as const
                  ).map(([value, title, text, Ic]) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setRole(value)}
                      className={cn(
                        'flex items-center gap-3 rounded-xl p-3 text-left ring-1 ring-inset transition',
                        role === value ? 'bg-indigo-50/60 ring-2 ring-indigo-500' : 'ring-slate-200 hover:bg-slate-50',
                      )}
                    >
                      <span className={cn('grid h-8 w-8 shrink-0 place-items-center rounded-lg', role === value ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-500')}>
                        <Ic className="h-4 w-4" />
                      </span>
                      <span>
                        <span className="block text-sm font-medium text-slate-900">{title}</span>
                        <span className="block text-xs text-slate-500">{text}</span>
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {isNew && (
              <div className="animate-fade-up">
                <Label htmlFor="name">Full name</Label>
                <Input
                  id="name"
                  type="text"
                  icon={IconUser}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Priya Sharma"
                  autoComplete="name"
                  disabled={loading}
                />
              </div>
            )}

            <div>
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                icon={IconMail}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
                autoFocus
                disabled={loading}
              />
            </div>

            <div>
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                icon={IconLock}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={isNew ? 'At least 8 characters' : '••••••••'}
                autoComplete={isNew ? 'new-password' : 'current-password'}
                disabled={loading}
              />
            </div>

            {isNew && role === 'recruiter' && (
              <div className="animate-fade-up">
                <Label htmlFor="code">Recruiter access code</Label>
                <Input
                  id="code"
                  type="text"
                  icon={IconShieldCheck}
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="Provided by your admin"
                  autoComplete="off"
                  disabled={loading}
                />
              </div>
            )}

            <Button type="submit" size="lg" loading={loading} className="w-full">
              {loading ? (isNew ? 'Creating account…' : 'Signing in…') : isNew ? 'Create account' : 'Sign in'}
              {!loading && <IconArrowRight />}
            </Button>
          </form>

          <p className="mt-10 text-center text-xs text-slate-400">Best experienced in Chrome or Edge with a microphone.</p>
        </div>
      </div>
    </div>
  );
}
