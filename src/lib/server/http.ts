// Shared HTTP helpers for /api route handlers.

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string
  ) {
    super(message)
    this.name = "HttpError"
  }
}

// Turns a thrown value into a JSON Response. Known HttpErrors keep their status
// and message; anything else is a logged 500.
export function errorResponse(error: unknown): Response {
  if (error instanceof HttpError) {
    return Response.json({ error: error.message }, { status: error.status })
  }
  console.error("Unhandled API error:", error)
  return Response.json({ error: "Lỗi máy chủ" }, { status: 500 })
}
