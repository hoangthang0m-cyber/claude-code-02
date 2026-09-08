import { describe, expect, it } from "vitest"

import { resolveMemberFields } from "@/lib/server/calendar/membersSync"

describe("resolveMemberFields", () => {
  it("uses the users/ name when present", () => {
    expect(
      resolveMemberFields({ name: "Nguyễn Văn An", email: "an@hem.vn", system_role: "staff" })
    ).toEqual({
      displayName: "Nguyễn Văn An",
      photoURL: null,
      role: "staff",
      active: true,
    })
  })

  it("falls back to the email local-part, then a generic label", () => {
    expect(resolveMemberFields({ name: "  ", email: "binh@hem.vn" }).displayName).toBe(
      "binh"
    )
    expect(resolveMemberFields({}).displayName).toBe("Thành viên")
  })

  it("maps system_role → role, defaulting non-manager to staff", () => {
    expect(resolveMemberFields({ system_role: "manager" }).role).toBe("manager")
    expect(resolveMemberFields({ system_role: "staff" }).role).toBe("staff")
    expect(resolveMemberFields({ system_role: "weird" }).role).toBe("staff")
    expect(resolveMemberFields({}).role).toBe("staff")
  })

  it("carries avatar → photoURL", () => {
    expect(resolveMemberFields({ avatar: "https://x/y.png" }).photoURL).toBe(
      "https://x/y.png"
    )
    expect(resolveMemberFields({ avatar: "" }).photoURL).toBeNull()
  })

  it("uses the auth-token fallback when the users/ doc has not committed yet", () => {
    expect(
      resolveMemberFields(undefined, { email: "new@hem.vn", system_role: "manager" })
    ).toEqual({
      displayName: "new",
      photoURL: null,
      role: "manager",
      active: true,
    })
  })

  it("prefers the users/ doc over the fallback", () => {
    const f = resolveMemberFields(
      { name: "Real Name", system_role: "staff" },
      { email: "stale@hem.vn", system_role: "manager" }
    )
    expect(f.displayName).toBe("Real Name")
    expect(f.role).toBe("staff")
  })
})
