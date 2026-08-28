import type { ContentStatus } from "@/lib/domain"

// Production status machine (SPEC §5.3). The one source of truth for which
// content-item status transitions are legal; every workflow endpoint validates
// against this, server-side (SPEC §5.3 R1: reject invalid transitions even when
// the UI is bypassed).
//
//   chua_bat_dau → viet_kich_ban → cho_duyet_kich_ban → quay_dung
//                → cho_duyet_video → da_duyet → da_len_ads
//   return: cho_duyet_kich_ban → viet_kich_ban  (reason required)
//           cho_duyet_video    → quay_dung      (reason required)

export type TransitionKind =
  | "advance" // staff moves their item forward
  | "submit" // staff sends for approval (needs the matching link)
  | "approve" // manager approves
  | "return" // manager sends back (reason required)
  | "publish" // manager marks "đã lên ads"

export interface ContentTransition {
  from: ContentStatus
  to: ContentStatus
  kind: TransitionKind
  /** SPEC §5.3 R3: returns require a reason. */
  requiresReason: boolean
  /** SPEC §5.3 R2: this link field must already be filled before submitting. */
  requiresLink?: "script_url" | "video_url"
}

export const CONTENT_TRANSITIONS: readonly ContentTransition[] = [
  { from: "chua_bat_dau", to: "viet_kich_ban", kind: "advance", requiresReason: false },
  {
    from: "viet_kich_ban",
    to: "cho_duyet_kich_ban",
    kind: "submit",
    requiresReason: false,
    requiresLink: "script_url",
  },
  { from: "cho_duyet_kich_ban", to: "quay_dung", kind: "approve", requiresReason: false },
  { from: "cho_duyet_kich_ban", to: "viet_kich_ban", kind: "return", requiresReason: true },
  {
    from: "quay_dung",
    to: "cho_duyet_video",
    kind: "submit",
    requiresReason: false,
    requiresLink: "video_url",
  },
  { from: "cho_duyet_video", to: "da_duyet", kind: "approve", requiresReason: false },
  { from: "cho_duyet_video", to: "quay_dung", kind: "return", requiresReason: true },
  { from: "da_duyet", to: "da_len_ads", kind: "publish", requiresReason: false },
] as const

// Work-step transitions are performed by the item's assignee; manager
// transitions by a project manager (SPEC §2, §5.3 R3).
export const WORK_STEP_KINDS: ReadonlySet<TransitionKind> = new Set([
  "advance",
  "submit",
])
export const MANAGER_KINDS: ReadonlySet<TransitionKind> = new Set([
  "approve",
  "return",
  "publish",
])

export function findTransition(
  from: ContentStatus,
  to: ContentStatus
): ContentTransition | undefined {
  return CONTENT_TRANSITIONS.find((t) => t.from === from && t.to === to)
}

export function isValidTransition(
  from: ContentStatus,
  to: ContentStatus
): boolean {
  return findTransition(from, to) !== undefined
}

export function transitionsFrom(from: ContentStatus): ContentTransition[] {
  return CONTENT_TRANSITIONS.filter((t) => t.from === from)
}
