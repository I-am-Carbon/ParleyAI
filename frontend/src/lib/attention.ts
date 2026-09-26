/**
 * Attention heuristics for interview integrity monitoring.
 * Everything here runs on the candidate's device; only the resulting events are sent to the server.
 */

export type EventType = 'looking_away' | 'no_face' | 'multiple_faces' | 'tab_hidden' | 'camera_off';
/** Problems detectable from a single camera frame. */
export type FrameEvent = 'looking_away' | 'no_face' | 'multiple_faces';
/** Conditions that end the interview automatically when they last too long. */
export type EndReason = 'looking_away' | 'no_face' | 'multiple_faces';
export const END_REASONS: EndReason[] = ['looking_away', 'no_face', 'multiple_faces'];

export interface IntegrityEventOut {
  type: EventType;
  started_at_ms: number; // ms since the interview started
  duration_ms: number;
}

/** What one camera frame tells us. Ratios come from face-mesh landmarks, so they don't depend on camera distance. */
export interface FrameInput {
  faces: number;
  yawRatio?: number; // nose position along the cheek-to-cheek axis (~0.5 facing the camera)
  pitchRatio?: number; // nose position along the forehead-to-chin axis
  gazeH?: number; // 0-1 eyes looking left/right (face blendshapes)
  gazeUp?: number; // 0-1 eyes looking up
  blinking?: boolean;
}

/** The candidate's own "looking at the screen" position, captured during calibration. */
export interface Baseline {
  yawRatio: number;
  pitchRatio: number;
  gazeH: number;
  gazeUp: number;
}

/**
 * How far from the calibrated baseline counts as looking away. Deliberately generous: reading different
 * parts of the screen, small head tilts and a webcam placed off to one side must not trigger it.
 */
export const THRESHOLDS = {
  yaw: 0.2, // head turned well to the side (~40°)
  pitchUp: 0.14,
  pitchDown: 0.18,
  gaze: 0.35, // eyes moved this much beyond their calibrated resting position...
  gazeMin: 0.55, // ...and are clearly looking away in absolute terms
};

/** A condition must last this long before it is recorded, so glances and blinks aren't flagged. */
export const MIN_DURATION_MS: Record<EventType, number> = {
  looking_away: 2500,
  no_face: 2000,
  multiple_faces: 1000,
  tab_hidden: 500,
  camera_off: 1000,
};

/** Looking away, face out of view, or a second person in view for this long ends the interview. */
export const AUTO_END_MS = 5000;
/** Show the candidate a countdown warning after this long. */
export const WARN_AFTER_MS = 2000;

/** How long a condition must be gone before it counts as over (stops one-frame flicker splitting events). */
const RECOVER_MS = 600;

// Face-mesh landmark indices.
const NOSE_TIP = 1;
const FOREHEAD = 10;
const CHIN = 152;
const CHEEK_A = 234;
const CHEEK_B = 454;

type Point = { x: number; y: number };

/** Position of p along the a→b axis (0 at a, 1 at b). Unaffected by rotating the head in the image plane. */
function along(p: Point, a: Point, b: Point, aspect: number): number {
  const dx = (b.x - a.x) * aspect;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  return len2 ? ((p.x - a.x) * aspect * dx + (p.y - a.y) * dy) / len2 : 0.5;
}

/** @param aspect video width / height, so normalised x and y are measured in the same units. */
export function frameFromResult(result: any, aspect = 4 / 3): FrameInput {
  const faces: number = result?.faceLandmarks?.length ?? 0;
  if (faces !== 1) return { faces };

  const lm = result.faceLandmarks[0];
  const cats: Array<{ categoryName: string; score: number }> = result.faceBlendshapes?.[0]?.categories ?? [];
  const s = (name: string) => cats.find((c) => c.categoryName === name)?.score ?? 0;

  return {
    faces,
    yawRatio: along(lm[NOSE_TIP], lm[CHEEK_A], lm[CHEEK_B], aspect),
    pitchRatio: along(lm[NOSE_TIP], lm[FOREHEAD], lm[CHIN], aspect),
    gazeH: Math.max((s('eyeLookOutLeft') + s('eyeLookInRight')) / 2, (s('eyeLookInLeft') + s('eyeLookOutRight')) / 2),
    gazeUp: (s('eyeLookUpLeft') + s('eyeLookUpRight')) / 2,
    blinking: s('eyeBlinkLeft') > 0.5 && s('eyeBlinkRight') > 0.5,
  };
}

/** Average the last few single-face frames to smooth out landmark jitter. */
export function smoothFrames(frames: FrameInput[]): FrameInput {
  const last = frames[frames.length - 1];
  const faceFrames = frames.filter((f) => f.faces === 1);
  if (last.faces !== 1 || faceFrames.length === 0) return last;
  const avg = (key: 'yawRatio' | 'pitchRatio' | 'gazeH' | 'gazeUp') =>
    faceFrames.reduce((sum, f) => sum + (f[key] ?? 0), 0) / faceFrames.length;
  return { ...last, yawRatio: avg('yawRatio'), pitchRatio: avg('pitchRatio'), gazeH: avg('gazeH'), gazeUp: avg('gazeUp') };
}

/**
 * Classify a frame. Returns the problem, or null when the candidate is attending to the screen.
 * `ignoreDown` is used while the candidate is typing, since looking at the keyboard is expected.
 */
export function classifyFrame(f: FrameInput, baseline: Baseline, ignoreDown = false): FrameEvent | null {
  if (f.faces === 0) return 'no_face';
  if (f.faces > 1) return 'multiple_faces';
  const dYaw = Math.abs((f.yawRatio ?? baseline.yawRatio) - baseline.yawRatio);
  const dPitch = (f.pitchRatio ?? baseline.pitchRatio) - baseline.pitchRatio; // positive = looking down
  const headAway = dYaw > THRESHOLDS.yaw || dPitch < -THRESHOLDS.pitchUp || (!ignoreDown && dPitch > THRESHOLDS.pitchDown);

  const gazeH = f.gazeH ?? 0;
  const gazeUp = f.gazeUp ?? 0;
  const eyesAway =
    !f.blinking &&
    ((gazeH - baseline.gazeH > THRESHOLDS.gaze && gazeH > THRESHOLDS.gazeMin) ||
      (gazeUp - baseline.gazeUp > THRESHOLDS.gaze && gazeUp > THRESHOLDS.gazeMin));
  return headAway || eyesAway ? 'looking_away' : null;
}

export function averageBaseline(samples: FrameInput[]): Baseline {
  const avg = (key: 'yawRatio' | 'pitchRatio' | 'gazeH' | 'gazeUp', fallback: number) =>
    samples.reduce((sum, f) => sum + (f[key] ?? fallback), 0) / samples.length;
  return { yawRatio: avg('yawRatio', 0.5), pitchRatio: avg('pitchRatio', 0.5), gazeH: avg('gazeH', 0), gazeUp: avg('gazeUp', 0) };
}

/** Turns a stream of per-frame states into debounced, timed events. Times are epoch ms. */
export class EventTracker {
  private pending: { type: EventType; since: number } | null = null;
  private open: { type: EventType; start: number } | null = null;
  private recoverSince: number | null = null;

  constructor(
    private readonly emit: (e: IntegrityEventOut) => void,
    private readonly originMs: number,
  ) {}

  update(raw: EventType | null, now: number): void {
    if (this.open) {
      if (raw === this.open.type) {
        this.recoverSince = null;
        this.pending = null;
        return;
      }
      this.recoverSince ??= now;
      this.track(raw, now); // time a new condition from the moment it appears, not after recovery
      if (now - this.recoverSince < RECOVER_MS) return;
      this.close(this.recoverSince);
    }
    this.track(raw, now);
    if (this.pending && now - this.pending.since >= MIN_DURATION_MS[this.pending.type]) {
      this.open = { type: this.pending.type, start: this.pending.since };
      this.pending = null;
    }
  }

  /** Close any open event (interview ending, tab hidden, etc.). */
  finish(now: number): void {
    if (this.open) this.close(this.recoverSince ?? now);
    this.pending = null;
  }

  private track(raw: EventType | null, now: number): void {
    if (!raw) this.pending = null;
    else if (!this.pending || this.pending.type !== raw) this.pending = { type: raw, since: now };
  }

  private close(end: number): void {
    const { type, start } = this.open!;
    this.emit({ type, started_at_ms: Math.max(0, Math.round(start - this.originMs)), duration_ms: Math.max(0, Math.round(end - start)) });
    this.open = null;
    this.recoverSince = null;
  }
}

/** How long a condition has held continuously, tolerating brief one-frame flickers. */
export class Streak {
  private since: number | null = null;
  private lastActive = 0;

  update(active: boolean, now: number): number {
    if (active) {
      this.since ??= now;
      this.lastActive = now;
      return now - this.since;
    }
    if (this.since !== null && now - this.lastActive < RECOVER_MS) return now - this.since;
    this.since = null;
    return 0;
  }

  reset(): void {
    this.since = null;
  }
}
