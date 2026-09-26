import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api/client';
import {
  AUTO_END_MS,
  END_REASONS,
  averageBaseline,
  classifyFrame,
  EventTracker,
  frameFromResult,
  MIN_DURATION_MS,
  smoothFrames,
  Streak,
  WARN_AFTER_MS,
  type Baseline,
  type EndReason,
  type FrameEvent,
  type FrameInput,
  type IntegrityEventOut,
} from '../lib/attention';

export interface MonitorWarning {
  type: EndReason;
  secondsLeft: number;
}

const SMOOTHING_FRAMES = 4;

// MediaPipe Face Landmarker, loaded from a CDN on first use (runs locally in the browser via WebAssembly).
const VISION_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14';
const MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';

const FRAME_MS = 125; // ~8 fps is plenty for attention and keeps CPU use low
const CALIBRATION_FRAMES = 12; // ~1.5 s of steady, single-face frames
const FLUSH_MS = 5000;

export type MonitorStatus =
  | 'idle'
  | 'starting'
  | 'calibrating'
  | 'ok'
  | 'looking_away'
  | 'no_face'
  | 'multiple_faces'
  | 'camera_off'
  | 'error';

let landmarkerPromise: Promise<any> | null = null;

function loadLandmarker(): Promise<any> {
  landmarkerPromise ??= (async () => {
    const vision: any = await import(/* @vite-ignore */ `${VISION_URL}/vision_bundle.mjs`);
    const fileset = await vision.FilesetResolver.forVisionTasks(`${VISION_URL}/wasm`);
    const options = (delegate: 'GPU' | 'CPU') => ({
      baseOptions: { modelAssetPath: MODEL_URL, delegate },
      runningMode: 'VIDEO',
      numFaces: 2,
      outputFaceBlendshapes: true,
    });
    try {
      return await vision.FaceLandmarker.createFromOptions(fileset, options('GPU'));
    } catch {
      return await vision.FaceLandmarker.createFromOptions(fileset, options('CPU'));
    }
  })();
  landmarkerPromise.catch(() => {
    landmarkerPromise = null; // allow a retry
  });
  return landmarkerPromise;
}

function cameraErrorMessage(e: any): string {
  if (e?.name === 'NotAllowedError' || e?.name === 'SecurityError') {
    return 'Camera access was blocked. Allow the camera from the icon in your browser’s address bar, then try again.';
  }
  if (e?.name === 'NotFoundError' || e?.name === 'OverconstrainedError') return 'No camera was found. Connect a webcam and try again.';
  if (e?.name === 'NotReadableError') return 'Your camera is being used by another app. Close it and try again.';
  return 'Couldn’t start attention monitoring. Check your internet connection and try again.';
}

/**
 * Camera-based attention monitoring. Video frames are analysed on-device and never uploaded;
 * only debounced events (type, start, duration) are sent to the backend.
 */
export function useIntegrityMonitor() {
  const [status, setStatus] = useState<MonitorStatus>('idle');
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState('');
  const [warning, setWarning] = useState<MonitorWarning | null>(null);
  const [calibrated, setCalibrated] = useState(false);

  const warningRef = useRef<MonitorWarning | null>(null);
  const recentRef = useRef<FrameInput[]>([]);
  const streaksRef = useRef<Record<EndReason, Streak>>({
    looking_away: new Streak(),
    no_face: new Streak(),
    multiple_faces: new Streak(),
  });
  const onTerminateRef = useRef<((reason: EndReason) => void) | null>(null);
  const terminatedRef = useRef(false);
  const statusRef = useRef<MonitorStatus>('idle');
  const streamRef = useRef<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const landmarkerRef = useRef<any>(null);
  const loopRef = useRef<number | null>(null);
  const baselineRef = useRef<Baseline | null>(null);
  const samplesRef = useRef<FrameInput[]>([]);
  const ignoreDownRef = useRef(false);

  const recordingRef = useRef(false);
  const interviewIdRef = useRef<number | null>(null);
  const originRef = useRef(0);
  const trackerRef = useRef<EventTracker | null>(null);
  const bufferRef = useRef<IntegrityEventOut[]>([]);
  const baselineSentRef = useRef(false);
  const hiddenSinceRef = useRef<number | null>(null);
  const flushTimerRef = useRef<number | null>(null);

  const setStatusIfChanged = useCallback((s: MonitorStatus) => {
    if (statusRef.current !== s) {
      statusRef.current = s;
      setStatus(s);
    }
  }, []);

  const setWarningIfChanged = useCallback((w: MonitorWarning | null) => {
    const prev = warningRef.current;
    if (prev?.type === w?.type && prev?.secondsLeft === w?.secondsLeft) return;
    warningRef.current = w;
    setWarning(w);
  }, []);

  const flush = useCallback(async () => {
    const id = interviewIdRef.current;
    if (!id) return;
    const events = bufferRef.current.splice(0);
    const baseline = !baselineSentRef.current && baselineRef.current ? { yaw_ratio: baselineRef.current.yawRatio, pitch_ratio: baselineRef.current.pitchRatio } : undefined;
    if (!events.length && !baseline) return;
    try {
      await api.interviews.addIntegrityEvents(id, events, baseline);
      if (baseline) baselineSentRef.current = true;
    } catch {
      bufferRef.current.unshift(...events); // retry on the next flush
    }
  }, []);

  const tick = useCallback(() => {
    loopRef.current = window.setTimeout(tick, FRAME_MS);
    if (document.hidden) return; // tab switches are tracked separately

    const now = Date.now();
    const live = streamRef.current?.getVideoTracks().some((t) => t.readyState === 'live' && t.enabled) ?? false;
    let raw: FrameEvent | 'camera_off' | null;

    if (!live) {
      raw = 'camera_off';
    } else {
      const video = videoRef.current;
      const landmarker = landmarkerRef.current;
      if (!video || !landmarker || video.readyState < 2) return;
      let frame: FrameInput;
      try {
        const aspect = video.videoWidth && video.videoHeight ? video.videoWidth / video.videoHeight : 4 / 3;
        frame = frameFromResult(landmarker.detectForVideo(video, performance.now()), aspect);
      } catch {
        return;
      }

      if (!baselineRef.current) {
        // Calibrate "looking at the screen" (head and eyes) from the candidate's own natural position,
        // so an off-centre webcam doesn't read as looking away.
        if (frame.faces === 1 && !frame.blinking) samplesRef.current.push(frame);
        if (samplesRef.current.length >= CALIBRATION_FRAMES) {
          baselineRef.current = averageBaseline(samplesRef.current);
          recentRef.current = [];
          setCalibrated(true);
        }
      }
      if (baselineRef.current) {
        recentRef.current = [...recentRef.current, frame].slice(-SMOOTHING_FRAMES);
        raw = classifyFrame(smoothFrames(recentRef.current), baselineRef.current, ignoreDownRef.current);
      } else {
        // Still calibrating: gaze can't be judged yet, but a missing or extra face still counts.
        raw = frame.faces === 0 ? 'no_face' : frame.faces > 1 ? 'multiple_faces' : null;
      }
    }

    setStatusIfChanged(raw ?? (baselineRef.current ? 'ok' : 'calibrating'));
    if (!recordingRef.current) return;
    trackerRef.current?.update(raw, now);

    // Auto-end: looking away, face out of view, or another person in view for too long.
    let worst: { type: EndReason; ms: number } = { type: 'looking_away', ms: 0 };
    for (const type of END_REASONS) {
      const ms = streaksRef.current[type].update(raw === type, now);
      if (ms > worst.ms) worst = { type, ms };
    }
    if (worst.ms >= AUTO_END_MS) {
      if (!terminatedRef.current) {
        terminatedRef.current = true;
        setWarningIfChanged(null);
        onTerminateRef.current?.(worst.type);
      }
    } else {
      setWarningIfChanged(worst.ms >= WARN_AFTER_MS ? { type: worst.type, secondsLeft: Math.ceil((AUTO_END_MS - worst.ms) / 1000) } : null);
    }
  }, [setStatusIfChanged, setWarningIfChanged]);

  const onVisibility = useCallback(() => {
    if (!recordingRef.current) return;
    const now = Date.now();
    if (document.hidden) {
      trackerRef.current?.finish(now);
      END_REASONS.forEach((t) => streaksRef.current[t].reset());
      setWarningIfChanged(null);
      hiddenSinceRef.current = now;
    } else if (hiddenSinceRef.current !== null) {
      const duration = now - hiddenSinceRef.current;
      if (duration >= MIN_DURATION_MS.tab_hidden) {
        bufferRef.current.push({
          type: 'tab_hidden',
          started_at_ms: Math.max(0, Math.round(hiddenSinceRef.current - originRef.current)),
          duration_ms: Math.round(duration),
        });
      }
      hiddenSinceRef.current = null;
    }
  }, [setWarningIfChanged]);

  const stopCamera = useCallback(() => {
    if (loopRef.current !== null) window.clearTimeout(loopRef.current);
    loopRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setStream(null);
    setCalibrated(false);
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  /** Ask for the camera, load the model and start calibrating. Safe to call again after an error. */
  const startCamera = useCallback(async () => {
    if (streamRef.current) return;
    setError('');
    setStatusIfChanged('starting');
    try {
      const media = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480, facingMode: 'user' }, audio: false });
      streamRef.current = media;
      setStream(media);
      const video = videoRef.current ?? document.createElement('video');
      video.muted = true;
      video.playsInline = true;
      video.srcObject = media;
      videoRef.current = video;
      await video.play();

      landmarkerRef.current = await loadLandmarker();
      baselineRef.current = null;
      samplesRef.current = [];
      setStatusIfChanged('calibrating');
      tick();
    } catch (e) {
      stopCamera();
      setError(cameraErrorMessage(e));
      setStatusIfChanged('error');
    }
  }, [setStatusIfChanged, stopCamera, tick]);

  const recalibrate = useCallback(() => {
    baselineRef.current = null;
    samplesRef.current = [];
    setCalibrated(false);
    baselineSentRef.current = false;
    setStatusIfChanged('calibrating');
  }, [setStatusIfChanged]);

  /**
   * Start recording events for an interview. `originMs` is the interview start time (epoch ms).
   * `onTerminate` is called once if the candidate looks away, or another person is in view, for too long.
   */
  const beginRecording = useCallback(
    (interviewId: number, originMs: number, onTerminate?: (reason: EndReason) => void) => {
      if (recordingRef.current) return;
      interviewIdRef.current = interviewId;
      originRef.current = originMs;
      onTerminateRef.current = onTerminate ?? null;
      terminatedRef.current = false;
      END_REASONS.forEach((t) => streaksRef.current[t].reset());
      trackerRef.current = new EventTracker((e) => bufferRef.current.push(e), originMs);
      // Re-calibrate in the candidate's actual interview posture (face checks keep running meanwhile).
      baselineRef.current = null;
      samplesRef.current = [];
      baselineSentRef.current = false;
      recordingRef.current = true;
      document.addEventListener('visibilitychange', onVisibility);
      flushTimerRef.current = window.setInterval(() => void flush(), FLUSH_MS);
    },
    [flush, onVisibility],
  );

  /** Close open events, send everything that's left, and turn the camera off. */
  const stop = useCallback(async () => {
    if (recordingRef.current) {
      const now = Date.now();
      trackerRef.current?.finish(now);
      if (hiddenSinceRef.current !== null) {
        bufferRef.current.push({
          type: 'tab_hidden',
          started_at_ms: Math.max(0, Math.round(hiddenSinceRef.current - originRef.current)),
          duration_ms: Math.round(now - hiddenSinceRef.current),
        });
        hiddenSinceRef.current = null;
      }
      recordingRef.current = false;
      document.removeEventListener('visibilitychange', onVisibility);
      if (flushTimerRef.current !== null) window.clearInterval(flushTimerRef.current);
      flushTimerRef.current = null;
    }
    setWarningIfChanged(null);
    stopCamera();
    setStatusIfChanged('idle');
    await flush();
  }, [flush, onVisibility, setStatusIfChanged, setWarningIfChanged, stopCamera]);

  const setIgnoreDown = useCallback((value: boolean) => {
    ignoreDownRef.current = value;
  }, []);

  // Leaving the page: stop the camera and send whatever we have.
  useEffect(
    () => () => {
      if (recordingRef.current) trackerRef.current?.finish(Date.now());
      recordingRef.current = false;
      document.removeEventListener('visibilitychange', onVisibility);
      if (flushTimerRef.current !== null) window.clearInterval(flushTimerRef.current);
      stopCamera();
      void flush();
    },
    [flush, onVisibility, stopCamera],
  );

  // Ready to join once the camera is on and the candidate's baseline has been captured.
  const ready = stream !== null && calibrated;

  return { status, stream, error, ready, warning, startCamera, recalibrate, beginRecording, stop, setIgnoreDown };
}

export const MONITOR_STATUS: Record<MonitorStatus, { label: string; tone: 'ok' | 'warn' | 'bad' | 'muted' }> = {
  idle: { label: 'Camera off', tone: 'muted' },
  starting: { label: 'Starting camera…', tone: 'muted' },
  calibrating: { label: 'Calibrating: look at the screen', tone: 'muted' },
  ok: { label: 'Face in view', tone: 'ok' },
  looking_away: { label: 'Looking away', tone: 'warn' },
  no_face: { label: 'Face not visible', tone: 'warn' },
  multiple_faces: { label: 'More than one person', tone: 'bad' },
  camera_off: { label: 'Camera off', tone: 'bad' },
  error: { label: 'Camera unavailable', tone: 'bad' },
};
