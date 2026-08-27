import { z } from "zod"

// Shared Zod building blocks for domain write-schemas.
//
// Write-schemas validate the *caller-supplied* portion of a document — the
// fields that arrive from a form or API request. Server-managed fields are
// never in a write-schema: `id` is the Firestore doc id; `created_at` /
// `updated_at` are set with `FieldValue.serverTimestamp()`; actor fields
// (`created_by`, `actor_id`, `author_id`) come from the verified auth context,
// not the request body.

export const idString = z.string().trim().min(1)

// ISO 8601 datetime string; the API handler converts it to a Firestore
// Timestamp before writing.
export const isoDateString = z
  .string()
  .refine((s) => !Number.isNaN(Date.parse(s)), "must be an ISO 8601 datetime")

export const urlString = z.string().trim().url()

// A free-text link field that is stored even when invalid (SPEC §5.1 R1: an
// unusable sheet URL is still saved, just flagged).
export const looseLinkString = z.string().trim().min(1)
