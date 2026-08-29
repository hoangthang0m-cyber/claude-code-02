import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { assertCronRequest } from "@/lib/server/cron"

const req = (auth?: string) =>
  new Request("http://x.test/api/jobs/x", {
    headers: auth ? { authorization: auth } : {},
  })

let prev: string | undefined

beforeEach(() => {
  prev = process.env.CRON_SECRET
  process.env.CRON_SECRET = "s3cret"
})
afterEach(() => {
  if (prev === undefined) delete process.env.CRON_SECRET
  else process.env.CRON_SECRET = prev
})

describe("assertCronRequest", () => {
  it("passes with the matching bearer secret", () => {
    expect(() => assertCronRequest(req("Bearer s3cret"))).not.toThrow()
  })

  it("401 on a wrong secret", () => {
    expect(() => assertCronRequest(req("Bearer nope"))).toThrow(/không hợp lệ/)
  })

  it("401 when the header is missing", () => {
    expect(() => assertCronRequest(req())).toThrow(/không hợp lệ/)
  })

  it("500 when CRON_SECRET is not configured", () => {
    delete process.env.CRON_SECRET
    expect(() => assertCronRequest(req("Bearer x"))).toThrow(/chưa cấu hình/)
  })
})
