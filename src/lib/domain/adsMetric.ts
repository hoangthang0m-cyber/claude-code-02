import type { Timestamp } from "firebase/firestore"
import { z } from "zod"

import {
  ADS_DELIVERY_STATUSES,
  ADS_METRIC_SOURCES,
  type AdsDeliveryStatus,
  type AdsMetricSource,
} from "@/lib/domain/enums"
import { idString, isoDateString } from "@/lib/domain/shared"

// SPEC §6.1: AdsMetric (id, content_item_id, source: synced | manual,
//   spend, messages, cost_per_*, roas, ctr, ads_started_on nullable,
//   delivery_status: active | paused | completed | unknown,
//   data_as_of, captured_at)
//
// §6.1 sketches the cost field as `cost_per_message`; SPEC §8 Q1 was answered
// "CPP = Cost Per Purchase", so it is `cost_per_purchase` here (cost per
// omni_purchase from Meta `cost_per_action_type`). `messages` still holds the
// count of `messaging_conversation_started` conversations.
//
// Append-only (SPEC §6.1): never updated in place. The current value of a
// content item = latest `synced` record, falling back to latest `manual`.
// captured_at is server-set at write time.

export interface AdsMetric {
  id: string
  content_item_id: string
  source: AdsMetricSource
  spend: number
  messages: number
  cost_per_purchase: number
  roas: number
  ctr: number
  ads_started_on?: Timestamp
  delivery_status: AdsDeliveryStatus
  data_as_of: Timestamp
  captured_at: Timestamp
}

const nonNegative = z.number().nonnegative()

// Manual entry (SPEC §5.4 R4): the manager types ROAS / CPP / Mess / CTR /
// spend. Synced entry: the same fields, written by the sync job.
export const adsMetricWriteSchema = z.object({
  content_item_id: idString,
  source: z.enum(ADS_METRIC_SOURCES),
  spend: nonNegative,
  messages: nonNegative,
  cost_per_purchase: nonNegative,
  roas: nonNegative,
  ctr: nonNegative,
  ads_started_on: isoDateString.nullable().optional(),
  delivery_status: z.enum(ADS_DELIVERY_STATUSES).default("unknown"),
  data_as_of: isoDateString,
})

export type AdsMetricWrite = z.infer<typeof adsMetricWriteSchema>
