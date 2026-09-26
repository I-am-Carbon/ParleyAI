/**
 * Typed API client wrapping the backend endpoints.
 */

export interface Job {
  id: number;
  title: string;
  description: string;
  competencies: { name: string; weight: number; description: string }[];
  created_at: string;
}

export interface Competency {
  name: string;
  weight?: number;
  description?: string;
}

export type Role = 'candidate' | 'recruiter';

export interface SessionUser {
  token: string;
  id: number;
  email: string;
  name: string;
  role: Role;
}

/** Persisted sign-in state. The server enforces access; the role here only drives which UI is shown. */
export const session = {
  token: () => localStorage.getItem('auth_token'),
  name: () => localStorage.getItem('candidate_name') ?? '',
  role: (): Role => (localStorage.getItem('user_role') === 'recruiter' ? 'recruiter' : 'candidate'),
  save(user: SessionUser) {
    localStorage.setItem('auth_token', user.token);
    localStorage.setItem('candidate_name', user.name);
    localStorage.setItem('user_role', user.role);
  },
  clear() {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('candidate_name');
    localStorage.removeItem('user_role');
  },
};

export interface Interview {
  id: number;
  candidate_name: string;
  candidate_email: string | null;
  has_report: boolean;
  results_visible: boolean;
  results_shared: boolean;
  end_reason: 'looking_away' | 'no_face' | 'multiple_faces' | null;
  job_id: number;
  job_title: string;
  mode: 'recruiter' | 'practice';
  experience_level: string | null;
  status: 'created' | 'in_progress' | 'completed';
  created_at: string;
  started_at: string | null;
  ended_at: string | null;
  overall_score: number | null;
  recommendation: string | null;
  integrity_risk: string | null;
}

export interface PlanTopic {
  competency: string;
  title: string;
  resume_evidence: string;
  opening_question: string;
}

export interface Turn {
  idx: number;
  topic: string;
  question: string;
  answer_transcript: string | null;
  answer_duration_s?: number | null;
  eval: any | null;
}

export interface InterviewDetail extends Interview {
  plan: PlanTopic[];
  state: Record<string, any>;
  profile: any;
  turns: Turn[];
}

export interface Question {
  turn_idx: number;
  topic: string;
  question: string;
  done: boolean;
}

export interface Report {
  interview_id: number;
  mode: string;
  experience_level: string | null;
  results_shared: boolean;
  end_reason: 'looking_away' | 'no_face' | 'multiple_faces' | null;
  candidate: { name: string; email: string | null; profile: any };
  job: { id: number; title: string };
  started_at: string;
  ended_at: string;
  report: {
    overall_score: number;
    recommendation: string;
    competency_scores: Array<{
      competency: string;
      score: number;
      evidence: string[];
      comment: string;
    }>;
    strengths: string[];
    gaps: string[];
    summary: string;
    integrity_summary: {
      enabled: boolean;
      risk_level?: string;
      away_percent?: number;
      session_seconds?: number;
      by_type?: Record<string, { count: number; total_seconds: number }>;
      flags?: string[];
      note: string;
    };
  };
  transcript: Turn[];
  integrity_events: Array<{
    type: string;
    started_at_ms: number;
    duration_ms: number;
  }>;
}

class APIError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'APIError';
  }
}

async function request<T>(
  method: string,
  path: string,
  body?: any,
  file?: File,
): Promise<T> {
  const opts: RequestInit = { method };
  const headers: HeadersInit = {};

  // Add auth token if available
  const token = session.token();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  if (file) {
    const formData = new FormData();
    for (const [k, v] of Object.entries(body || {})) {
      formData.append(k, v as string);
    }
    formData.append('resume', file);
    opts.body = formData;
  } else if (body) {
    headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }

  opts.headers = headers;
  const resp = await fetch(path, opts);

  if (!resp.ok) {
    const data = await resp.json().catch(() => ({}));
    if (resp.status === 401 && token) {
      // Session expired or revoked: back to the sign-in screen.
      session.clear();
      window.location.href = '/';
    }
    throw new APIError(resp.status, data.detail || resp.statusText);
  }

  return resp.json();
}

export const api = {
  auth: {
    login(email: string, password: string): Promise<SessionUser> {
      return request('POST', '/api/auth/login', { email, password });
    },
    signup(body: { name: string; email: string; password: string; role: Role; recruiter_code?: string }): Promise<SessionUser> {
      return request('POST', '/api/auth/signup', body);
    },
    logout(): Promise<{ ok: boolean }> {
      return request('POST', '/api/auth/logout');
    },
  },

  jobs: {
    list(): Promise<Job[]> {
      return request('GET', '/api/jobs');
    },
    create(job: { title: string; description: string; competencies: Competency[] }): Promise<Job> {
      return request('POST', '/api/jobs', job);
    },
  },

  interviews: {
    list(): Promise<Interview[]> {
      return request('GET', '/api/interviews');
    },
    create(job_id: number, mode: 'recruiter' | 'practice', experience_level: string, resume: File): Promise<any> {
      return request('POST', '/api/interviews', { job_id, mode, experience_level }, resume);
    },
    get(id: number): Promise<InterviewDetail> {
      return request('GET', `/api/interviews/${id}`);
    },
    start(id: number): Promise<Question> {
      return request('POST', `/api/interviews/${id}/start`);
    },
    answer(id: number, transcript: string, duration_s?: number): Promise<Question> {
      return request('POST', `/api/interviews/${id}/answer`, { transcript, duration_s });
    },
    /** `reason` is set when attention monitoring ended the interview automatically. */
    finish(
      id: number,
      reason?: 'looking_away' | 'no_face' | 'multiple_faces',
    ): Promise<{ interview_id: number; status: string; results_visible: boolean; overall_score: number | null }> {
      return request('POST', `/api/interviews/${id}/finish`, reason ? { reason } : undefined);
    },
    share(id: number, shared: boolean): Promise<{ interview_id: number; results_shared: boolean }> {
      return request('POST', `/api/interviews/${id}/share`, { shared });
    },
    addIntegrityEvents(
      id: number,
      events: Array<{ type: string; started_at_ms: number; duration_ms: number; meta?: any }>,
      baseline_pose?: Record<string, number>,
    ): Promise<{ accepted: number }> {
      return request('POST', `/api/interviews/${id}/integrity`, baseline_pose ? { events, baseline_pose } : { events });
    },
  },

  reports: {
    get(id: number): Promise<Report> {
      return request('GET', `/api/interviews/${id}/report`);
    },
  },
};

export { APIError };
