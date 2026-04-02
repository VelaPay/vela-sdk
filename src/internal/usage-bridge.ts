export interface UsageReportBridgePayload {
  mandateAddress: string;
  merchantAddress: string;
  periodStart: string;
  periodEnd: string;
  usageUnits: number;
  txSignature: string;
}

export interface UsageReportBridgeRetryOptions {
  maxAttempts?: number;
  initialDelayMs?: number;
  fetchImpl?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
  sleep?: (ms: number) => Promise<void>;
}

export interface UsageReportBridgeResult {
  ok: boolean;
  attempts: number;
  status?: number;
  error?: string;
}

function normalizeEndpoint(endpoint: string): string {
  return endpoint.replace(/\/+$/, "");
}

function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function postUsageReportBridge(
  keeperEndpoint: string,
  payload: UsageReportBridgePayload,
  authToken?: string,
  options?: UsageReportBridgeRetryOptions,
): Promise<UsageReportBridgeResult> {
  const maxAttempts = options?.maxAttempts ?? 3;
  const initialDelayMs = options?.initialDelayMs ?? 250;
  const fetchImpl = options?.fetchImpl ?? fetch;
  const sleep = options?.sleep ?? defaultSleep;

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (authToken) {
    headers.Authorization = `Bearer ${authToken}`;
  }

  const endpoint = normalizeEndpoint(keeperEndpoint);

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await fetchImpl(`${endpoint}/api/keeper/usage-report`, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        return { ok: true, attempts: attempt, status: response.status };
      }

      let error = `HTTP ${response.status}`;
      try {
        const body = (await response.json()) as { error?: string };
        error = body.error ?? error;
      } catch {
        // Keep the fallback HTTP status string.
      }

      if (!isRetryableStatus(response.status) || attempt === maxAttempts) {
        return { ok: false, attempts: attempt, status: response.status, error };
      }
    } catch (err) {
      if (attempt === maxAttempts) {
        return { ok: false, attempts: attempt, error: String(err) };
      }
    }

    await sleep(initialDelayMs * 2 ** (attempt - 1));
  }

  return { ok: false, attempts: maxAttempts, error: "Usage bridge failed unexpectedly" };
}
