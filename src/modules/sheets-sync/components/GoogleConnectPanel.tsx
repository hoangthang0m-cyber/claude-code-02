"use client"

import * as React from "react"
import { toast } from "sonner"

import type { GoogleConnectionView } from "@/lib/domain"
import { useAuth } from "@/context/AuthContext"
import {
  getGoogleConnection,
  startGoogleConnect,
} from "@/modules/sheets-sync/services/google.client"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"

// SPEC §6.3, task 6.1: a manager connects their own Google account so Sheets
// sync runs with their real access. Refresh token is stored encrypted
// server-side; here we only ever see the account email + state.
export function GoogleConnectPanel() {
  const { user, profile } = useAuth()
  const isManager = profile?.system_role === "manager"

  const [connection, setConnection] =
    React.useState<GoogleConnectionView | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [busy, setBusy] = React.useState(false)

  React.useEffect(() => {
    const p = new URLSearchParams(window.location.search)
    if (p.get("google_error")) toast.error(p.get("google_error") ?? "")
    if (p.get("google") === "connected") toast.success("Đã kết nối Google")
    if (p.has("google") || p.has("google_error")) {
      window.history.replaceState({}, "", "/ad-accounts")
    }
  }, [])

  React.useEffect(() => {
    if (!user) return
    let cancelled = false
    getGoogleConnection()
      .then((r) => {
        if (!cancelled) setConnection(r.connection)
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [user])

  async function connect() {
    setBusy(true)
    try {
      const { url } = await startGoogleConnect()
      window.location.href = url
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Không bắt đầu được kết nối")
      setBusy(false)
    }
  }

  if (!isManager) return null

  return (
    <div className="flex max-w-2xl flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Google Sheets</h2>
          <p className="text-sm text-muted-foreground">
            Kết nối tài khoản Google để đồng bộ 2 chiều với sheet tiến độ. Token
            được lưu mã hoá.
          </p>
        </div>
        <Button onClick={connect} disabled={busy} size="sm">
          {connection ? "Kết nối lại" : "Kết nối Google"}
        </Button>
      </div>

      {loading ? (
        <Skeleton className="h-14 rounded-lg" />
      ) : connection ? (
        <div className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm">
          <div className="flex flex-col">
            <span className="font-medium">{connection.email}</span>
            <span className="text-xs text-muted-foreground">
              {connection.connected_at
                ? `Kết nối ${new Date(connection.connected_at).toLocaleDateString("vi-VN")}`
                : ""}
            </span>
          </div>
          {connection.state === "connected" ? (
            <Badge>Đã kết nối</Badge>
          ) : (
            <Badge variant="destructive">Cần kết nối lại</Badge>
          )}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          Chưa kết nối tài khoản Google.
        </p>
      )}
    </div>
  )
}
