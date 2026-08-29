import { authedJson } from "@/lib/api/authedFetch"
import type { AdAccountConnectionView } from "@/lib/domain"

// Client wrappers for the Meta Ad Account connect APIs (SPEC §5.4 R1).

export interface PendingAdAccount {
  account_id: string
  name: string
}

export function listAdAccountConnections() {
  return authedJson<{ connections: AdAccountConnectionView[] }>(
    "/api/ad-accounts"
  )
}

export function startMetaConnect() {
  return authedJson<{ url: string }>("/api/ad-accounts/meta/start", {
    method: "POST",
  })
}

export function getPendingAdAccounts() {
  return authedJson<{ accounts: PendingAdAccount[] }>(
    "/api/ad-accounts/meta/pending"
  )
}

export function saveAdAccountConnection(adAccountId: string, name: string) {
  return authedJson<{ id: string }>("/api/ad-accounts", {
    method: "POST",
    body: JSON.stringify({ ad_account_id: adAccountId, name }),
  })
}
