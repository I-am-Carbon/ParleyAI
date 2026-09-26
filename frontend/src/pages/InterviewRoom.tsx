import { Fragment, useEffect, useRef, useState } from 'react';
import { api, InterviewDetail, Question } from '../api/client';
import AiOrb, { type OrbState } from '../components/AiOrb';
import CameraTile from '../components/CameraTile';
import {
  IconArrowLeft,
  IconArrowRight,
  IconCheckCircle,
  IconEraser,
  IconGlobe,
  IconHeadphones,
  IconKeyboard,
  IconLightbulb,
  IconMessage,
  IconMic,
  IconPhoneOff,
  IconReplay,
  IconSend,
  IconShieldAlert,
  IconVideo,
  type Icon,
} from '../components/icons';
import ProcessingOverlay from '../components/ProcessingOverlay';
import { Alert, Button, Logo, Modal, Spinner, cn } from '../components/ui';
import { useIntegrityMonitor } from '../hooks/useIntegrityMonitor';
import { useSpeechRecognition } from '../hooks/useSpeechRecognition';
import { useSpeechSynthesis } from '../hooks/useSpeechSynthesis';
import { INTERVIEWER_NAME } from '../lib/brand';
import { formatClock } from '../lib/format';

interface Props {
  id: number;
  onFinish: () => void;
  onExit: () => void;
}

type Phase = 'lobby' | 'connecting' | 'speaking' | 'listening' | 'thinking' | 'finishing' | 'failed' | 'submitted' | 'terminated';
type EndReason = 'looking_away' | 'no_face' | 'multiple_faces';

const END_REASON_COPY: Record<EndReason, { warning: string; ended: string }> = {
  looking_away: {
    warning: 'Please look back at the screen.',
    ended: 'You looked away from the screen for more than 5 seconds.',
  },
  no_face: {
    warning: 'We can’t see your face. Move back into view of the camera.',
    ended: 'Your face was not visible to the camera for more than 5 seconds.',
  },
  multiple_faces: {
    warning: 'Only you should be in view of the camera.',
    ended: 'More than one person was in view of the camera for more than 5 seconds.',
  },
};

interface Exchange {
  question: string;
  answer: string;
  topic: string;
}

export default function InterviewRoom({ id, onFinish, onExit }: Props) {
  const speech = useSpeechRecognition();
  const tts = useSpeechSynthesis();
  const monitor = useIntegrityMonitor();
  const [consent, setConsent] = useState(false);
  const [endReason, setEndReason] = useState<EndReason | null>(null);
  const endedRef = useRef(false); // set once the interview is ending, so in-flight steps stop
  const terminateRef = useRef<(reason: EndReason) => void>(() => {});

  const [phase, setPhase] = useState<Phase>('lobby');
  const [detail, setDetail] = useState<InterviewDetail | null>(null);
  const [question, setQuestion] = useState<Question | null>(null);
  const [history, setHistory] = useState<Exchange[]>([]);
  const [typed, setTyped] = useState('');
  const [typeMode, setTypeMode] = useState(!speech.isSupported);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [showTranscript, setShowTranscript] = useState(true);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [topicIdx, setTopicIdx] = useState(0);

  const typeModeRef = useRef(typeMode);
  const answerStartRef = useRef(0);
  const aliveRef = useRef(true);
  const transcriptEndRef = useRef<HTMLDivElement>(null);
  const submitRef = useRef<() => void>(() => {});

  const plan = detail?.plan ?? [];
  // Attention monitoring applies to real (recruiter-mode) interviews only.
  const monitored = detail?.mode === 'recruiter';

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  useEffect(() => {
    typeModeRef.current = typeMode;
    // Looking down at the keyboard is expected while typing.
    monitor.setIgnoreDown(typeMode);
  }, [typeMode, monitor.setIgnoreDown]);

  // Load interview info for the lobby (and prior answers when resuming).
  useEffect(() => {
    api.interviews
      .get(id)
      .then((d) => {
        setDetail(d);
        setHistory(
          d.turns
            .filter((t) => t.answer_transcript !== null)
            .map((t) => ({ question: t.question, answer: t.answer_transcript as string, topic: t.topic })),
        );
      })
      .catch((e) => setError(e.message));
  }, [id]);

  // Interview clock.
  useEffect(() => {
    if (!startedAt || phase === 'finishing') return;
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [startedAt, phase]);

  // Mic blocked: fall back to typing.
  useEffect(() => {
    if (speech.error === 'not-allowed' || speech.error === 'service-not-allowed') {
      setTypeMode(true);
      setNotice('Microphone access is blocked, so you can type your answers instead. To use voice, allow the mic in the address bar.');
    }
  }, [speech.error]);

  // Keep the transcript scrolled to the latest message.
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [history.length, question?.turn_idx]);

  // Ctrl/Cmd + Enter submits.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        submitRef.current();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const trackTopic = (q: Question) => {
    if (q.topic === 'Closing') {
      setTopicIdx(plan.length);
      return;
    }
    const idx = plan.findIndex((t) => t.title === q.topic);
    if (idx >= 0) setTopicIdx(idx);
  };

  const finish = async (reason?: EndReason) => {
    if (endedRef.current) return;
    endedRef.current = true;
    setConfirmEnd(false);
    speech.stop();
    tts.stop();
    if (reason) setEndReason(reason);
    setPhase('finishing');
    try {
      // Send the last attention events before the report is generated.
      if (monitored) await monitor.stop();
      const result = await api.interviews.finish(id, reason);
      if (!aliveRef.current) return;
      // Practice feedback opens straight away; real interviews go to the hiring team.
      if (reason) setPhase('terminated');
      else if (result.results_visible) onFinish();
      else setPhase('submitted');
    } catch (e: any) {
      setError(e.message);
      setPhase('failed');
    }
  };
  terminateRef.current = (reason) => void finish(reason);

  const askQuestion = async (q: Question) => {
    if (endedRef.current) return;
    setPhase('speaking');
    await tts.speak(q.question);
    if (!aliveRef.current || endedRef.current) return;
    if (q.done) {
      await finish();
      return;
    }
    setPhase('listening');
    answerStartRef.current = Date.now();
    if (!typeModeRef.current) speech.start();
  };

  const join = async () => {
    if (monitored && (!monitor.ready || !consent)) return;
    setPhase('connecting');
    setError('');
    try {
      const q = await api.interviews.start(id);
      const parsed = detail?.started_at ? Date.parse(detail.started_at) : Date.now();
      const started = Number.isNaN(parsed) ? Date.now() : parsed;
      setStartedAt(started);
      setNow(Date.now());
      if (monitored) monitor.beginRecording(id, started, (reason) => terminateRef.current(reason));
      setQuestion(q);
      trackTopic(q);
      await askQuestion(q);
    } catch (e: any) {
      setError(e.message);
      setPhase('lobby');
    }
  };

  const submit = async () => {
    if (phase !== 'listening' || !question) return;
    const text = (typeMode ? typed : speech.transcript).trim();
    if (!text) {
      setNotice("I didn't catch an answer yet. Speak or type your response, then submit.");
      return;
    }
    speech.stop();
    setNotice('');
    setPhase('thinking');
    const duration = (Date.now() - answerStartRef.current) / 1000;
    try {
      const next = await api.interviews.answer(id, text, duration);
      if (endedRef.current) return;
      setHistory((h) => [...h, { question: question.question, answer: text, topic: question.topic }]);
      speech.reset();
      setTyped('');
      setQuestion(next);
      trackTopic(next);
      await askQuestion(next);
    } catch (e: any) {
      if (endedRef.current) return;
      // Keep the answer so the candidate can retry.
      setError(e.message);
      setPhase('listening');
      if (!typeModeRef.current) speech.start();
    }
  };
  submitRef.current = submit;

  const replay = async () => {
    if (!question || phase !== 'listening') return;
    speech.stop();
    setPhase('speaking');
    await tts.speak(question.question);
    if (!aliveRef.current || endedRef.current) return;
    setPhase('listening');
    if (!typeModeRef.current) speech.start();
  };

  const clearAnswer = () => {
    speech.reset();
    setTyped('');
  };

  const toggleTypeMode = () => {
    if (!typeMode) {
      speech.stop();
      setTyped((t) => t || speech.transcript);
      setTypeMode(true);
    } else {
      setTypeMode(false);
      if (phase === 'listening') speech.start();
    }
  };

  /* ---------- Ended automatically by attention monitoring ---------- */

  if (phase === 'terminated') {
    return (
      <DarkBackdrop scroll>
        <header className="relative z-10 flex h-16 items-center px-4 sm:px-6">
          <Logo dark />
        </header>
        <main className="relative z-10 flex flex-1 items-center justify-center px-4 py-10">
          <div className="w-full max-w-md animate-fade-up rounded-2xl bg-white/[0.04] p-8 text-center ring-1 ring-inset ring-white/10 backdrop-blur">
            <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-rose-500/15 text-rose-300 ring-1 ring-inset ring-rose-400/30">
              <IconShieldAlert className="h-7 w-7" />
            </div>
            <h1 className="mt-5 text-2xl font-semibold tracking-tight text-white">Interview ended</h1>
            <p className="mt-2 text-sm leading-relaxed text-slate-300">{endReason ? END_REASON_COPY[endReason].ended : ''}</p>
            <p className="mt-3 text-sm leading-relaxed text-slate-400">
              As explained before you joined, this ends the interview automatically. Your answers so far and the reason have been sent to the
              hiring team, who will review them.
            </p>
            <Button size="lg" className="mt-8 w-full" onClick={onExit}>
              Back to dashboard
            </Button>
          </div>
        </main>
      </DarkBackdrop>
    );
  }

  /* ---------- Submitted (recruiter interviews) ---------- */

  if (phase === 'submitted' || (phase === 'lobby' && detail?.status === 'completed' && !detail.results_visible)) {
    return (
      <DarkBackdrop scroll>
        <header className="relative z-10 flex h-16 items-center px-4 sm:px-6">
          <Logo dark />
        </header>
        <main className="relative z-10 flex flex-1 items-center justify-center px-4 py-10">
          <div className="w-full max-w-md animate-fade-up rounded-2xl bg-white/[0.04] p-8 text-center ring-1 ring-inset ring-white/10 backdrop-blur">
            <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-emerald-400/15 text-emerald-300 ring-1 ring-inset ring-emerald-400/30">
              <IconCheckCircle className="h-7 w-7" />
            </div>
            <h1 className="mt-5 text-2xl font-semibold tracking-tight text-white">Interview submitted</h1>
            <p className="mt-2 text-sm leading-relaxed text-slate-400">
              Thanks for your time{detail?.candidate_name ? `, ${detail.candidate_name.split(' ')[0]}` : ''}. Your interview for{' '}
              <span className="text-slate-200">{detail?.job_title ?? 'the role'}</span> has been sent to the hiring team, who will be in touch about next steps.
            </p>
            <Button size="lg" className="mt-8 w-full" onClick={onExit}>
              Back to dashboard
            </Button>
          </div>
        </main>
      </DarkBackdrop>
    );
  }

  /* ---------- Lobby ---------- */

  if (phase === 'lobby' || phase === 'connecting' || phase === 'failed') {
    const resuming = detail?.status === 'in_progress';
    const completed = detail?.status === 'completed';
    return (
      <DarkBackdrop scroll>
        <header className="relative z-10 flex h-16 items-center justify-between px-4 sm:px-6">
          <Logo dark />
          <Button variant="dark" size="sm" onClick={onExit}>
            <IconArrowLeft /> Dashboard
          </Button>
        </header>

        <main className="relative z-10 flex flex-1 items-center justify-center px-4 py-10">
          <div className="grid w-full max-w-5xl items-center gap-10 md:grid-cols-2">
            <div className="flex flex-col items-center text-center">
              <AiOrb state={phase === 'connecting' ? 'thinking' : 'idle'} />
              <div className="mt-2 text-sm text-slate-400">Your interviewer</div>
              <div className="text-xl font-semibold text-white">{INTERVIEWER_NAME}</div>
            </div>

            <div className="animate-fade-up rounded-2xl bg-white/[0.04] p-6 ring-1 ring-inset ring-white/10 backdrop-blur sm:p-8">
              {!detail && !error ? (
                <div className="flex items-center gap-3 text-slate-400">
                  <Spinner className="text-indigo-400" /> Loading interview…
                </div>
              ) : (
                <>
                  <div className="text-xs font-medium uppercase tracking-wider text-indigo-300">
                    {detail?.mode === 'practice' ? 'Practice session' : 'Recruiter interview'}
                  </div>
                  <h1 className="mt-2 text-2xl font-semibold tracking-tight text-white sm:text-3xl">{detail?.job_title ?? 'Interview'}</h1>
                  <p className="mt-2 text-sm text-slate-400">
                    {plan.length > 0 ? `${plan.length} topics` : 'A few topics'} · about 15–20 minutes · spoken conversation
                  </p>

                  {plan.length > 0 && (
                    <div className="mt-5 flex flex-wrap gap-2">
                      {plan.map((t) => (
                        <span key={t.title} className="rounded-full bg-white/5 px-3 py-1 text-xs text-slate-300 ring-1 ring-inset ring-white/10">
                          {t.competency}
                        </span>
                      ))}
                    </div>
                  )}

                  <ul className="mt-6 space-y-3 text-sm text-slate-300">
                    <LobbyTip icon={IconHeadphones}>Find a quiet spot. Headphones stop {INTERVIEWER_NAME} hearing their own voice.</LobbyTip>
                    <LobbyTip icon={IconMic}>Allow microphone access when your browser asks.</LobbyTip>
                    <LobbyTip icon={IconLightbulb}>Think out loud. {INTERVIEWER_NAME} asks follow-ups based on what you say.</LobbyTip>
                    {!speech.isSupported && (
                      <LobbyTip icon={IconGlobe} warn>
                        Voice isn't supported in this browser. You can type your answers, or switch to Chrome or Edge.
                      </LobbyTip>
                    )}
                  </ul>

                  {monitored && !completed && phase !== 'failed' && (
                    <div className="mt-6 rounded-xl bg-white/[0.03] p-4 ring-1 ring-inset ring-white/10">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2 text-sm font-medium text-white">
                          <IconVideo className="h-4 w-4 text-indigo-300" /> Camera check
                        </div>
                        {monitor.stream && (
                          <button onClick={monitor.recalibrate} className="text-xs text-slate-400 transition hover:text-white">
                            Recalibrate
                          </button>
                        )}
                      </div>
                      <p className="mt-1.5 text-xs leading-relaxed text-slate-400">
                        Your camera is used to note attention during the interview, such as looking away or another person in view. Video is
                        analysed on this device and is never recorded or uploaded. Only the times of these moments are shared with the hiring
                        team.
                      </p>
                      <p className="mt-2 rounded-lg bg-amber-400/10 px-3 py-2 text-xs leading-relaxed text-amber-200 ring-1 ring-inset ring-amber-400/20">
                        The interview <strong className="font-semibold">ends automatically</strong> if, for more than 5 seconds, you look away
                        from the screen, your face is out of view, or another person is in view. You'll see a warning first.
                      </p>

                      {monitor.stream ? (
                        <CameraTile large stream={monitor.stream} status={monitor.status} className="mt-4 aspect-video w-full" />
                      ) : (
                        <Button variant="dark" className="mt-4 w-full" onClick={monitor.startCamera} loading={monitor.status === 'starting'}>
                          <IconVideo /> {monitor.status === 'error' ? 'Try again' : 'Turn on camera'}
                        </Button>
                      )}
                      {monitor.stream && monitor.status === 'calibrating' && (
                        <p className="mt-2 text-xs text-slate-400">Sit as you will during the interview and look at the screen for a moment.</p>
                      )}
                      {monitor.error && <Alert className="mt-3">{monitor.error}</Alert>}

                      <label className="mt-4 flex cursor-pointer items-start gap-3 text-sm text-slate-300">
                        <input
                          type="checkbox"
                          checked={consent}
                          onChange={(e) => setConsent(e.target.checked)}
                          className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-indigo-500"
                        />
                        I understand and agree to attention monitoring, including the automatic end rule, during this interview.
                      </label>
                    </div>
                  )}

                  {error && (
                    <Alert className="mt-6" onClose={phase === 'failed' ? undefined : () => setError('')}>
                      {error}
                    </Alert>
                  )}

                  <div className="mt-8">
                    {phase === 'failed' ? (
                      <Button size="lg" className="w-full" onClick={onExit}>
                        Back to dashboard
                      </Button>
                    ) : completed ? (
                      <Button size="lg" className="w-full" onClick={onFinish}>
                        View report <IconArrowRight />
                      </Button>
                    ) : (
                      <>
                        <Button
                          size="lg"
                          className="w-full"
                          onClick={join}
                          loading={phase === 'connecting'}
                          disabled={!detail || (monitored && (!monitor.ready || !consent))}
                        >
                          {phase === 'connecting' ? 'Connecting…' : resuming ? 'Resume interview' : 'Join interview'}
                          {phase !== 'connecting' && <IconArrowRight />}
                        </Button>
                        {monitored && (!monitor.ready || !consent) && (
                          <p className="mt-3 text-center text-xs text-slate-500">
                            {!monitor.stream
                              ? 'Turn on your camera to continue.'
                              : !monitor.ready
                                ? 'Look at the screen for a moment to finish calibrating.'
                                : 'Tick the box above to continue.'}
                          </p>
                        )}
                      </>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </main>
      </DarkBackdrop>
    );
  }

  /* ---------- Live room ---------- */

  const orbState: OrbState = phase === 'speaking' ? 'speaking' : phase === 'listening' ? 'listening' : phase === 'thinking' ? 'thinking' : 'idle';
  const statusLabel =
    phase === 'speaking'
      ? `${INTERVIEWER_NAME} is speaking`
      : phase === 'listening'
        ? typeMode
          ? 'Your turn · type your answer'
          : 'Your turn · listening'
        : phase === 'thinking'
          ? `${INTERVIEWER_NAME} is thinking`
          : 'Wrapping up';
  const answerText = typeMode ? typed : speech.transcript;
  const canSubmit = phase === 'listening' && answerText.trim().length > 0;
  const shownTopic = Math.min(topicIdx + 1, Math.max(plan.length, 1));

  return (
    <DarkBackdrop>
      {phase === 'finishing' && (
        <ProcessingOverlay
          dark
          title={detail?.mode === 'practice' ? 'Generating your feedback' : 'Submitting your interview'}
          subtitle="Hang tight, this takes a few seconds."
          steps={
            detail?.mode === 'practice'
              ? ['Wrapping up the conversation', 'Scoring each competency', 'Collecting evidence from your answers', 'Writing your feedback']
              : ['Wrapping up the conversation', 'Saving your answers', 'Sending your interview to the hiring team']
          }
        />
      )}

      <Modal open={confirmEnd} onClose={() => setConfirmEnd(false)} dark>
        <div className="grid h-11 w-11 place-items-center rounded-xl bg-rose-500/15 text-rose-300">
          <IconPhoneOff className="h-5 w-5" />
        </div>
        <h3 className="mt-4 text-lg font-semibold">End the interview now?</h3>
        <p className="mt-1.5 text-sm text-slate-400">
          Your {detail?.mode === 'practice' ? 'feedback' : 'evaluation'} will be based on the {history.length} answer{history.length === 1 ? '' : 's'} given so
          far. You can't resume afterwards.
        </p>
        <div className="mt-6 flex justify-end gap-3">
          <Button variant="dark" onClick={() => setConfirmEnd(false)}>
            Keep going
          </Button>
          <Button variant="danger" onClick={() => void finish()}>
            End interview
          </Button>
        </div>
      </Modal>

      {monitored && monitor.warning && phase !== 'finishing' && (
        <div className="pointer-events-none fixed inset-x-0 top-20 z-40 flex justify-center px-4" role="alert" aria-live="assertive">
          <div className="flex w-full max-w-md animate-fade-up items-center gap-4 rounded-2xl bg-rose-600/95 px-5 py-4 text-white shadow-2xl shadow-rose-900/40 ring-1 ring-rose-300/30 backdrop-blur">
            <div className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-white/15 text-2xl font-semibold tabular-nums">
              {monitor.warning.secondsLeft}
            </div>
            <div className="min-w-0">
              <div className="font-semibold">{END_REASON_COPY[monitor.warning.type].warning}</div>
              <div className="text-sm text-rose-100">
                The interview will end in {monitor.warning.secondsLeft} second{monitor.warning.secondsLeft === 1 ? '' : 's'}.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Top bar */}
      <header className="relative z-10 flex h-16 shrink-0 items-center justify-between gap-4 border-b border-white/5 px-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-4">
          <Logo dark />
          <div className="hidden h-6 w-px bg-white/10 md:block" />
          <div className="hidden min-w-0 md:block">
            <div className="truncate text-sm font-medium text-white">{detail?.job_title}</div>
            <div className="text-xs text-slate-400">{detail?.mode === 'practice' ? 'Practice session' : 'Recruiter interview'}</div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-2 rounded-full bg-white/5 px-3 py-1.5 text-sm tabular-nums text-slate-200 ring-1 ring-inset ring-white/10">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-500 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-rose-500" />
            </span>
            {startedAt ? formatClock(now - startedAt) : '00:00'}
          </span>
          <Button variant="dark-danger" size="sm" onClick={() => setConfirmEnd(true)} disabled={phase === 'finishing'}>
            <IconPhoneOff /> <span className="hidden sm:inline">End</span>
          </Button>
        </div>
      </header>

      <div className="relative z-10 flex min-h-0 flex-1">
        <main className="relative flex min-w-0 flex-1 flex-col">
          {monitored && (
            <CameraTile
              stream={monitor.stream}
              status={monitor.status}
              className="absolute right-2 top-16 z-10 sm:right-3"
            />
          )}

          {/* Topic progress */}
          {plan.length > 0 && (
            <div className="mx-auto w-full max-w-3xl px-4 pt-6 sm:px-6">
              <div className="mb-2 flex items-center justify-between gap-4 text-xs">
                <span className="font-medium text-slate-300">
                  Topic {shownTopic} of {plan.length}
                </span>
                <span className="truncate text-slate-500">{question?.topic === 'Closing' ? 'Wrap-up' : question?.topic}</span>
              </div>
              <div className="flex gap-1.5">
                {plan.map((t, i) => (
                  <div
                    key={t.title}
                    title={t.title}
                    className={cn(
                      'h-1 flex-1 rounded-full transition-colors duration-500',
                      i < topicIdx ? 'bg-indigo-400' : i === topicIdx ? 'bg-gradient-to-r from-indigo-400 to-fuchsia-400' : 'bg-white/10',
                    )}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Stage */}
          <div className="scrollbar-thin flex flex-1 flex-col items-center justify-center gap-6 overflow-y-auto px-4 py-6 text-center sm:px-6">
            <AiOrb state={orbState} />
            <div
              className={cn(
                'inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium uppercase tracking-wider ring-1 ring-inset',
                phase === 'listening'
                  ? 'bg-emerald-400/10 text-emerald-300 ring-emerald-400/20'
                  : phase === 'thinking'
                    ? 'bg-amber-400/10 text-amber-300 ring-amber-400/20'
                    : 'bg-violet-400/10 text-violet-300 ring-violet-400/20',
              )}
            >
              {statusLabel}
            </div>
            {question && (
              <p key={question.turn_idx} className="max-w-3xl animate-fade-up text-balance text-xl font-medium leading-snug text-white sm:text-2xl lg:text-[28px]">
                {question.question}
              </p>
            )}
          </div>

          {/* Answer + controls */}
          <div className="shrink-0 px-4 pb-5 sm:px-6">
            <div className="mx-auto max-w-3xl space-y-3">
              {notice && (
                <Alert tone="warning" onClose={() => setNotice('')}>
                  {notice}
                </Alert>
              )}
              {error && <Alert onClose={() => setError('')}>{error}</Alert>}

              <div
                className={cn(
                  'rounded-2xl bg-white/[0.04] p-4 ring-1 ring-inset backdrop-blur transition',
                  phase === 'listening' ? 'ring-emerald-400/30' : 'ring-white/10',
                )}
              >
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-medium uppercase tracking-wider text-slate-400">Your answer</span>
                  <MicChip listening={phase === 'listening' && !typeMode && speech.isListening} typing={typeMode} />
                </div>
                {typeMode ? (
                  <textarea
                    value={typed}
                    onChange={(e) => setTyped(e.target.value)}
                    disabled={phase !== 'listening'}
                    placeholder={phase === 'listening' ? 'Type your answer…' : 'You can answer once the question has been asked.'}
                    rows={3}
                    autoFocus
                    className="scrollbar-thin w-full resize-none bg-transparent text-[15px] leading-relaxed text-slate-100 placeholder:text-slate-500 focus:outline-none disabled:opacity-60"
                  />
                ) : (
                  <p className="scrollbar-thin max-h-32 min-h-[3.5rem] overflow-y-auto text-[15px] leading-relaxed text-slate-100">
                    {speech.finalText}
                    {speech.interim && <span className="text-slate-400"> {speech.interim}</span>}
                    {!speech.finalText && !speech.interim && (
                      <span className="text-slate-500">
                        {phase === 'speaking'
                          ? `Listen to the question. You can answer as soon as ${INTERVIEWER_NAME} finishes.`
                          : phase === 'listening'
                            ? 'Start speaking. Your words will appear here.'
                            : 'Processing your answer…'}
                      </span>
                    )}
                  </p>
                )}
              </div>

              <div className="flex items-end justify-center gap-3 sm:gap-5">
                <Control icon={IconReplay} label="Replay" onClick={replay} disabled={phase !== 'listening'} />
                <Control icon={IconEraser} label="Clear" onClick={clearAnswer} disabled={phase !== 'listening' || !answerText} />
                <div className="flex flex-col items-center gap-1.5">
                  <button
                    onClick={submit}
                    disabled={!canSubmit}
                    className="inline-flex h-12 items-center gap-2 rounded-full bg-indigo-500 px-6 text-sm font-semibold text-white shadow-lg shadow-indigo-500/30 transition hover:bg-indigo-400 active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-slate-500 disabled:shadow-none"
                  >
                    {phase === 'thinking' ? <Spinner className="h-4 w-4 text-white" /> : <IconSend className="h-4 w-4" />}
                    Submit answer
                  </button>
                  <span className="hidden text-[11px] text-slate-500 sm:block">Ctrl + Enter</span>
                </div>
                {speech.isSupported && (
                  <Control
                    icon={typeMode ? IconMic : IconKeyboard}
                    label={typeMode ? 'Use voice' : 'Type'}
                    onClick={toggleTypeMode}
                    disabled={phase === 'thinking'}
                  />
                )}
                <Control
                  icon={IconMessage}
                  label="Transcript"
                  onClick={() => setShowTranscript((s) => !s)}
                  active={showTranscript}
                  className="hidden lg:flex"
                />
              </div>
            </div>
          </div>
        </main>

        {/* Transcript */}
        {showTranscript && (
          <aside className="hidden w-[380px] shrink-0 flex-col border-l border-white/5 bg-slate-900/40 lg:flex">
            <div className="flex items-center justify-between border-b border-white/5 px-5 py-4">
              <div className="text-sm font-semibold text-white">Transcript</div>
              <span className="text-xs text-slate-500">
                {history.length} answer{history.length === 1 ? '' : 's'}
              </span>
            </div>
            <div className="scrollbar-thin flex-1 space-y-4 overflow-y-auto px-5 py-5">
              {history.map((h, i) => (
                <Fragment key={i}>
                  <Bubble who="ai" text={h.question} />
                  <Bubble who="you" text={h.answer} />
                </Fragment>
              ))}
              {question && <Bubble who="ai" text={question.question} current />}
              <div ref={transcriptEndRef} />
            </div>
          </aside>
        )}
      </div>
    </DarkBackdrop>
  );
}

/* ---------- Pieces ---------- */

function DarkBackdrop({ children, scroll = false }: { children: React.ReactNode; scroll?: boolean }) {
  return (
    <div
      className={cn(
        'relative flex flex-col bg-slate-950 text-slate-100',
        scroll ? 'min-h-screen overflow-x-hidden' : 'h-[100dvh] overflow-hidden',
      )}
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_50%_-10%,rgba(99,102,241,0.22),transparent)]" />
      <div className="bg-grid pointer-events-none absolute inset-0 opacity-[0.15] [mask-image:radial-gradient(ellipse_at_center,black,transparent_70%)]" />
      {children}
    </div>
  );
}

function LobbyTip({ icon: IconCmp, warn = false, children }: { icon: Icon; warn?: boolean; children: React.ReactNode }) {
  return (
    <li className={cn('flex gap-3', warn && 'text-amber-300')}>
      <IconCmp className={cn('mt-0.5 h-4 w-4 shrink-0', warn ? 'text-amber-400' : 'text-indigo-300')} />
      <span>{children}</span>
    </li>
  );
}

function MicChip({ listening, typing }: { listening: boolean; typing: boolean }) {
  if (typing) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-slate-400">
        <IconKeyboard className="h-3.5 w-3.5" /> Typing
      </span>
    );
  }
  return listening ? (
    <span className="inline-flex items-center gap-2 text-xs font-medium text-emerald-300">
      <span className="flex h-3 items-center gap-0.5">
        {[0, 0.2, 0.4].map((d) => (
          <span key={d} className="h-3 w-0.5 rounded-full bg-emerald-300 animate-eq" style={{ animationDelay: `${d}s` }} />
        ))}
      </span>
      Mic on
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 text-xs text-slate-500">
      <IconMic className="h-3.5 w-3.5" /> Mic paused
    </span>
  );
}

function Control({
  icon: IconCmp,
  label,
  onClick,
  disabled,
  active,
  className,
}: {
  icon: Icon;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
  className?: string;
}) {
  return (
    <button onClick={onClick} disabled={disabled} className={cn('group flex flex-col items-center gap-1.5 disabled:cursor-not-allowed disabled:opacity-40', className)}>
      <span
        className={cn(
          'grid h-12 w-12 place-items-center rounded-full ring-1 ring-inset transition',
          active ? 'bg-white text-slate-900 ring-white' : 'bg-white/5 text-slate-200 ring-white/10 group-hover:bg-white/10',
        )}
      >
        <IconCmp className="h-5 w-5" />
      </span>
      <span className="text-[11px] text-slate-400">{label}</span>
    </button>
  );
}

function Bubble({ who, text, current = false }: { who: 'ai' | 'you'; text: string; current?: boolean }) {
  if (who === 'you') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-tr-sm bg-indigo-500/20 px-4 py-2.5 text-sm leading-relaxed text-indigo-50 ring-1 ring-inset ring-indigo-400/20">
          {text}
        </div>
      </div>
    );
  }
  return (
    <div className="flex gap-2.5">
      <div className="mt-0.5 h-6 w-6 shrink-0 rounded-full bg-gradient-to-br from-indigo-500 via-violet-500 to-fuchsia-500" />
      <div className="min-w-0">
        <div className="mb-1 text-xs font-medium text-slate-400">{INTERVIEWER_NAME}</div>
        <div
          className={cn(
            'rounded-2xl rounded-tl-sm px-4 py-2.5 text-sm leading-relaxed ring-1 ring-inset',
            current ? 'bg-white/10 text-white ring-white/15' : 'bg-white/[0.04] text-slate-300 ring-white/5',
          )}
        >
          {text}
        </div>
      </div>
    </div>
  );
}
