"use client"

import * as React from "react"
import { toast } from "sonner"

import type { NotificationGroup } from "@/lib/domain"
import { useAuth } from "@/context/AuthContext"
import {
  getNotificationPreferences,
  setNotificationPreference,
  type NotificationPreferenceView,
} from "@/modules/notifications/services/notificationPreferences.client"
import { Checkbox } from "@/components/ui/checkbox"
import { Skeleton } from "@/components/ui/skeleton"

// SPEC §5.7 R4, task 7.5: each person turns notification groups on/off for
// themselves. Opt-out model — everything starts on.
export function NotificationPreferencesPanel() {
  const { user } = useAuth()
  const [prefs, setPrefs] = React.useState<NotificationPreferenceView[] | null>(
    null
  )
  const [saving, setSaving] = React.useState<NotificationGroup | null>(null)

  React.useEffect(() => {
    if (!user) return
    let cancelled = false
    getNotificationPreferences()
      .then((r) => {
        if (!cancelled) setPrefs(r.preferences)
      })
      .catch(() => {
        if (!cancelled) setPrefs([])
      })
    return () => {
      cancelled = true
    }
  }, [user])

  async function toggle(group: NotificationGroup, enabled: boolean) {
    setPrefs((p) =>
      (p ?? []).map((x) => (x.group === group ? { ...x, enabled } : x))
    )
    setSaving(group)
    try {
      await setNotificationPreference(group, enabled)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Không lưu được")
      setPrefs((p) =>
        (p ?? []).map((x) =>
          x.group === group ? { ...x, enabled: !enabled } : x
        )
      )
    } finally {
      setSaving(null)
    }
  }

  return (
    <div className="flex max-w-2xl flex-col gap-3">
      <div>
        <h2 className="text-lg font-semibold">Thông báo</h2>
        <p className="text-sm text-muted-foreground">
          Tắt một nhóm để ngừng nhận thông báo in-app nhóm đó. Các nhóm khác
          không đổi.
        </p>
      </div>

      {prefs === null ? (
        <Skeleton className="h-40 rounded-lg" />
      ) : (
        <ul className="flex flex-col divide-y rounded-lg border">
          {prefs.map((p) => (
            <li
              key={p.group}
              className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm"
            >
              <label htmlFor={`notif-${p.group}`}>{p.label}</label>
              <Checkbox
                id={`notif-${p.group}`}
                checked={p.enabled}
                disabled={saving === p.group}
                onCheckedChange={(c) => toggle(p.group, c === true)}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
