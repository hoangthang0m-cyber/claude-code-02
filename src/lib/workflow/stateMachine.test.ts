import { describe, expect, it } from "vitest"

import { CONTENT_STATUSES } from "@/lib/domain"
import {
  CONTENT_TRANSITIONS,
  MANAGER_KINDS,
  WORK_STEP_KINDS,
  findTransition,
  isValidTransition,
  transitionsFrom,
} from "@/lib/workflow/stateMachine"

// The 8 legal transitions (SPEC §5.3), as "from>to" keys.
const LEGAL = new Set([
  "chua_bat_dau>viet_kich_ban",
  "viet_kich_ban>cho_duyet_kich_ban",
  "cho_duyet_kich_ban>quay_dung",
  "cho_duyet_kich_ban>viet_kich_ban",
  "quay_dung>cho_duyet_video",
  "cho_duyet_video>da_duyet",
  "cho_duyet_video>quay_dung",
  "da_duyet>da_len_ads",
])

describe("production state machine (SPEC §5.3)", () => {
  it("accepts exactly the 8 legal transitions and rejects every other pair", () => {
    for (const from of CONTENT_STATUSES) {
      for (const to of CONTENT_STATUSES) {
        const expected = LEGAL.has(`${from}>${to}`)
        expect(isValidTransition(from, to), `${from} → ${to}`).toBe(expected)
      }
    }
    // no self-transitions
    for (const s of CONTENT_STATUSES) {
      expect(isValidTransition(s, s)).toBe(false)
    }
  })

  it("has no duplicate transition entries", () => {
    const keys = CONTENT_TRANSITIONS.map((t) => `${t.from}>${t.to}`)
    expect(new Set(keys).size).toBe(keys.length)
    expect(keys.length).toBe(8)
  })

  it("requires a reason only for the two return transitions (§5.3 R3)", () => {
    for (const t of CONTENT_TRANSITIONS) {
      const isReturn = t.kind === "return"
      expect(t.requiresReason, `${t.from} → ${t.to}`).toBe(isReturn)
    }
    expect(findTransition("cho_duyet_kich_ban", "viet_kich_ban")?.requiresReason).toBe(true)
    expect(findTransition("cho_duyet_video", "quay_dung")?.requiresReason).toBe(true)
  })

  it("requires the matching link on the two submit transitions (§5.3 R2)", () => {
    expect(findTransition("viet_kich_ban", "cho_duyet_kich_ban")?.requiresLink).toBe(
      "script_url"
    )
    expect(findTransition("quay_dung", "cho_duyet_video")?.requiresLink).toBe(
      "video_url"
    )
    // no other transition requires a link
    const withLink = CONTENT_TRANSITIONS.filter((t) => t.requiresLink)
    expect(withLink).toHaveLength(2)
  })

  it("skipping the review step is rejected (§5.3 R1 scenario)", () => {
    expect(isValidTransition("quay_dung", "da_duyet")).toBe(false)
    expect(isValidTransition("viet_kich_ban", "quay_dung")).toBe(false)
    expect(isValidTransition("chua_bat_dau", "da_len_ads")).toBe(false)
  })

  it("classifies every transition as a work step or a manager action", () => {
    for (const t of CONTENT_TRANSITIONS) {
      const isWork = WORK_STEP_KINDS.has(t.kind)
      const isMgr = MANAGER_KINDS.has(t.kind)
      expect(isWork !== isMgr, `${t.kind}`).toBe(true) // exactly one
    }
  })

  it("transitionsFrom lists the outgoing legal moves per state", () => {
    expect(transitionsFrom("cho_duyet_kich_ban").map((t) => t.to).sort()).toEqual([
      "quay_dung",
      "viet_kich_ban",
    ])
    expect(transitionsFrom("cho_duyet_video").map((t) => t.to).sort()).toEqual([
      "da_duyet",
      "quay_dung",
    ])
    expect(transitionsFrom("da_len_ads")).toEqual([]) // terminal
    expect(transitionsFrom("chua_bat_dau").map((t) => t.to)).toEqual([
      "viet_kich_ban",
    ])
  })
})
