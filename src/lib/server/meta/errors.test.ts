import { describe, expect, it } from "vitest"

import {
  classifyMetaError,
  MetaGraphError,
  metaNetworkError,
} from "@/lib/server/meta/errors"

const err = (code?: number, type?: string) => ({
  error: { code, type, message: "x" },
})

describe("classifyMetaError (SPEC §5.4 R3, §6.4)", () => {
  it("code 190 / OAuthException → auth (not retryable)", () => {
    expect(classifyMetaError(err(190), 400, "c").kind).toBe("auth")
    expect(classifyMetaError(err(undefined, "OAuthException"), 400, "c").kind).toBe(
      "auth"
    )
    expect(classifyMetaError(err(190), 400, "c").retryable).toBe(false)
  })

  it("rate-limit codes and HTTP 429 → rate_limit (retryable)", () => {
    for (const code of [4, 17, 32, 341, 613, 80004]) {
      expect(classifyMetaError(err(code), 400, "c").kind).toBe("rate_limit")
    }
    expect(classifyMetaError(null, 429, "c").kind).toBe("rate_limit")
    expect(classifyMetaError(err(4), 400, "c").retryable).toBe(true)
  })

  it("HTTP 5xx → transient (retryable)", () => {
    expect(classifyMetaError(null, 503, "c").kind).toBe("transient")
    expect(classifyMetaError(null, 500, "c").retryable).toBe(true)
  })

  it("plain 4xx → fatal (not retryable)", () => {
    const e = classifyMetaError(err(100), 400, "c")
    expect(e.kind).toBe("fatal")
    expect(e.retryable).toBe(false)
  })

  it("carries context + code in the message", () => {
    const e = classifyMetaError(err(17), 400, "insights")
    expect(e.message).toContain("insights")
    expect(e.code).toBe(17)
  })
})

describe("metaNetworkError", () => {
  it("is a retryable transient error", () => {
    const e = metaNetworkError("status")
    expect(e).toBeInstanceOf(MetaGraphError)
    expect(e.kind).toBe("transient")
    expect(e.retryable).toBe(true)
  })
})
