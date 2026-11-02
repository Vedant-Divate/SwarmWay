import type {
  ApiErrorPayload,
  HealthResponse,
  MapDetail,
  MapPresetResponse,
  MapSummary,
  ScenarioKind,
  SolveRequest,
  Trace,
} from '../types';

const RAW_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '';
export const API_BASE = RAW_BASE.trim().replace(/\/+$/, '');

export class SolverApiError extends Error {
  public readonly code: string;
  public readonly details?: Record<string, unknown>;

  constructor(code: string, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'SolverApiError';
    this.code = code;
    this.details = details;
  }
}

async function parseJsonResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let payload: ApiErrorPayload | null = null;
    try {
      payload = (await res.json()) as ApiErrorPayload;
    } catch {
      // Non-JSON error body
    }
    if (payload && payload.error && typeof payload.error.message === 'string') {
      throw new SolverApiError(
        payload.error.code || `HTTP_${res.status}`,
        payload.error.message,
        payload.error.details
      );
    }
    throw new SolverApiError(
      `HTTP_${res.status}`,
      `Solver API returned HTTP ${res.status} (${res.statusText || 'Error'})`
    );
  }
  return (await res.json()) as T;
}

/**
 * Checks GET {API_BASE}/api/health with a short timeout.
 * If VITE_API_BASE_URL is empty, resolves null immediately without network traffic.
 */
export async function checkSolverHealth(timeoutMs = 2200): Promise<HealthResponse | null> {
  if (!API_BASE) {
    return null;
  }
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${API_BASE}/api/health`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const data = (await res.json()) as HealthResponse;
    if (data && data.status === 'ok') {
      return data;
    }
    return null;
  } catch {
    return null;
  } finally {
    window.clearTimeout(timer);
  }
}

export async function fetchMaps(): Promise<MapSummary[]> {
  const res = await fetch(`${API_BASE}/api/maps`, {
    headers: { Accept: 'application/json' },
  });
  return parseJsonResponse<MapSummary[]>(res);
}

export async function fetchMapDetail(mapId: string): Promise<MapDetail> {
  const res = await fetch(`${API_BASE}/api/maps/${encodeURIComponent(mapId)}`, {
    headers: { Accept: 'application/json' },
  });
  return parseJsonResponse<MapDetail>(res);
}

export async function fetchMapPresets(
  mapId: string,
  scenario: ScenarioKind,
  agents: number
): Promise<MapPresetResponse> {
  const params = new URLSearchParams({
    scenario,
    agents: String(agents),
  });
  const res = await fetch(
    `${API_BASE}/api/maps/${encodeURIComponent(mapId)}/presets?${params.toString()}`,
    {
      headers: { Accept: 'application/json' },
    }
  );
  return parseJsonResponse<MapPresetResponse>(res);
}

export async function postSolve(body: SolveRequest): Promise<Trace> {
  const res = await fetch(`${API_BASE}/api/solve`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(body),
  });
  return parseJsonResponse<Trace>(res);
}

export async function fetchBundledTrace(filePath: string): Promise<Trace> {
  const res = await fetch(filePath, {
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) {
    throw new Error(`Failed to load bundled trace: ${filePath}`);
  }
  return (await res.json()) as Trace;
}
