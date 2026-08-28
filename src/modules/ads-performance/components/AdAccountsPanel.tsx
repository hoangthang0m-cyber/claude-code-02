"use client"

import * as React from "react"
import { toast } from "sonner"

import { useAuth } from "@/context/AuthContext"
import { useAdAccounts } from "@/modules/ads-performance/hooks/useAdAccounts"
import {
  saveAdAccountConnection,
  startMetaConnect,
} from "@/modules/ads-performance/services/adAccounts.client"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"

// SPEC §5.4 R1: a manager connects one or more Meta Ad Accounts over OAuth. The
// long-lived token is stored encrypted server-side; here we only ever see the
// account name + state.
export function AdAccountsPanel() {
  const { profile } = useAuth()
  const { connections, pending, loading, error, refresh } = useAdAccounts()
  const [busy, setBusy] = React.useState(false)

  const isManager = profile?.system_role === "manager"

  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get("error")) toast.error(params.get("error") ?? "")
    if (params.has("error") || params.has("picking")) {
      window.history.replaceState({}, "", "/ad-accounts")
    }
  }, [])

  async function connect() {
    setBusy(true)
    try {
      const { url } = await startMetaConnect()
      window.location.href = url
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Không bắt đầu được kết nối")
      setBusy(false)
    }
  }

  async function pick(adAccountId: string, name: string) {
    setBusy(true)
    try {
      await saveAdAccountConnection(adAccountId, name)
      toast.success(`Đã kết nối ${name}`)
      refresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Không lưu được kết nối")
    } finally {
      setBusy(false)
    }
  }

  if (!isManager) {
    return (
      <p className="text-sm text-muted-foreground">
        Chỉ Trưởng phòng được kết nối tài khoản quảng cáo Meta.
      </p>
    )
  }

  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">Tài khoản quảng cáo Meta</h1>
          <p className="text-sm text-muted-foreground">
            Kết nối qua OAuth để kéo số liệu ads tự động. Token được lưu mã hoá.
          </p>
        </div>
        <Button onClick={connect} disabled={busy} size="sm">
          Kết nối Ad Account Meta
        </Button>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {pending.length > 0 && (
        <div className="flex flex-col gap-2 rounded-lg border border-dashed p-3">
          <p className="text-sm font-medium">
            Chọn tài khoản để lưu kết nối ({pending.length})
          </p>
          {pending.map((a) => (
            <div
              key={a.account_id}
              className="flex items-center justify-between gap-3 text-sm"
            >
              <span>
                {a.name}{" "}
                <span className="text-muted-foreground">({a.account_id})</span>
              </span>
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => pick(a.account_id, a.name)}
              >
                Lưu
              </Button>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-2">
        {loading ? (
          <Skeleton className="h-20 rounded-lg" />
        ) : connections.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Chưa có tài khoản nào được kết nối.
          </p>
        ) : (
          connections.map((c) => (
            <div
              key={c.id}
              className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm"
            >
              <div className="flex flex-col">
                <span className="font-medium">{c.name}</span>
                <span className="text-xs text-muted-foreground">
                  act_{c.ad_account_id}
                  {c.token_expires_at
                    ? ` · token đến ${new Date(c.token_expires_at).toLocaleDateString("vi-VN")}`
                    : ""}
                </span>
              </div>
              {c.state === "connected" ? (
                <Badge>Đã kết nối</Badge>
              ) : (
                <Badge variant="destructive">Cần kết nối lại</Badge>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
