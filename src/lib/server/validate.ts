import type { ZodType } from "zod"

import { HttpError } from "@/lib/server/http"

// Parses a request body against a Zod schema, throwing HttpError(400) with a
// per-field message when it fails (SPEC §5.1 R1: "từ chối, chỉ rõ trường
// thiếu"). Used by every /api handler that accepts a body.
export function parseOrThrow<T>(schema: ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data)
  if (!result.success) {
    const detail = result.error.issues
      .map((issue) => {
        const field = issue.path.join(".") || "(body)"
        return `${field}: ${issue.message}`
      })
      .join("; ")
    throw new HttpError(400, `Dữ liệu không hợp lệ — ${detail}`)
  }
  return result.data
}

// Reads and JSON-parses a request body, treating an empty/invalid body as {}.
export async function readJsonBody(request: Request): Promise<unknown> {
  try {
    const text = await request.text()
    return text ? JSON.parse(text) : {}
  } catch {
    throw new HttpError(400, "Body không phải JSON hợp lệ")
  }
}
