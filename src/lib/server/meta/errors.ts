// Classifying Meta Graph API failures so the sync job knows what to do
// (SPEC §5.4 R3, §6.4):
//   auth       — token dead/revoked → mark AdAccountConnection needs_reconnect
//   rate_limit — back off and retry, keep the last AdsMetric
//   transient  — network / 5xx → back off and retry
//   fatal      — bad request / gone object / permission → count, don't retry

export type MetaErrorKind = "auth" | "rate_limit" | "transient" | "fatal"

const RATE_LIMIT_CODES = new Set([4, 17, 32, 341, 613])

export class MetaGraphError extends Error {
  constructor(
    public readonly kind: MetaErrorKind,
    message: string,
    public readonly code?: number
  ) {
    super(message)
    this.name = "MetaGraphError"
  }

  get retryable(): boolean {
    return this.kind === "rate_limit" || this.kind === "transient"
  }
}

interface MetaErrorBody {
  error?: { code?: number; type?: string; message?: string }
}

export function classifyMetaError(
  body: MetaErrorBody | null,
  httpStatus: number,
  context: string
): MetaGraphError {
  const err = body?.error ?? {}
  const code = err.code
  const message = `${context}: ${err.message ?? `HTTP ${httpStatus}`}`

  if (code === 190 || err.type === "OAuthException") {
    return new MetaGraphError("auth", message, code)
  }
  if (
    httpStatus === 429 ||
    (code != null && (RATE_LIMIT_CODES.has(code) || code >= 80000))
  ) {
    return new MetaGraphError("rate_limit", message, code)
  }
  if (httpStatus >= 500) {
    return new MetaGraphError("transient", message, code)
  }
  return new MetaGraphError("fatal", message, code)
}

// A thrown network error (fetch rejected) — always worth a retry.
export function metaNetworkError(context: string): MetaGraphError {
  return new MetaGraphError("transient", `${context}: không gọi được Meta`)
}
