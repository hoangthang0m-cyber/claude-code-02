"use client"

import * as React from "react"
import {
  ArrowDownIcon,
  ArrowUpIcon,
  ExternalLinkIcon,
  PencilIcon,
  PlusIcon,
  Trash2Icon,
} from "lucide-react"
import { toast } from "sonner"

import type { ReferenceLinkOwnerType, ReferenceLinkView } from "@/lib/domain"
import {
  addReferenceLink,
  deleteReferenceLink,
  reorderReferenceLinks,
  updateReferenceLink,
} from "@/modules/reference-links/services/referenceLinks.client"
import { useReferenceLinks } from "@/modules/reference-links/hooks/useReferenceLinks"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"

interface Props {
  ownerType: ReferenceLinkOwnerType
  ownerId: string
  /** heading text; omit for a bare list (e.g. inside a content-item panel) */
  title?: string
  compact?: boolean
}

// task 4.2 / 4.3: the reference-links list for a project or a content item.
// Any project member can add / edit / delete / reorder.
export function ReferenceLinksPanel({ ownerType, ownerId, title, compact }: Props) {
  const { links, overWarnLimit, loading, error, refresh } = useReferenceLinks(
    ownerType,
    ownerId
  )
  const [busy, setBusy] = React.useState(false)

  async function run(p: Promise<unknown>, ok?: string) {
    setBusy(true)
    try {
      await p
      if (ok) toast.success(ok)
      refresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Thất bại")
    } finally {
      setBusy(false)
    }
  }

  function move(index: number, dir: -1 | 1) {
    const next = [...links]
    const j = index + dir
    if (j < 0 || j >= next.length) return
    ;[next[index], next[j]] = [next[j], next[index]]
    run(
      reorderReferenceLinks({
        owner_type: ownerType,
        owner_id: ownerId,
        ordered_ids: next.map((l) => l.id),
      })
    )
  }

  return (
    <section className="flex flex-col gap-2">
      {title && <h3 className="text-sm font-semibold">{title}</h3>}

      {error && <p className="text-sm text-destructive">{error}</p>}
      {overWarnLimit && (
        <p className="text-xs text-amber-600 dark:text-amber-500">
          Đang có nhiều link ({links.length}) — nên gộp / dọn bớt.
        </p>
      )}

      {loading ? (
        <Skeleton className="h-16 rounded-lg" />
      ) : links.length === 0 ? (
        <p className="text-sm text-muted-foreground">Chưa có link tham khảo.</p>
      ) : (
        <ul className="flex flex-col divide-y rounded-lg border">
          {links.map((link, i) => (
            <LinkRow
              key={link.id}
              link={link}
              first={i === 0}
              last={i === links.length - 1}
              busy={busy}
              compact={compact}
              onUp={() => move(i, -1)}
              onDown={() => move(i, 1)}
              onSave={(patch) =>
                run(updateReferenceLink(link.id, patch), "Đã lưu link")
              }
              onDelete={() =>
                run(deleteReferenceLink(link.id), "Đã xoá link")
              }
            />
          ))}
        </ul>
      )}

      <NewLinkRow
        busy={busy}
        onAdd={(url, label, note) =>
          run(
            addReferenceLink({ owner_type: ownerType, owner_id: ownerId, url, label, note }),
            "Đã thêm link"
          )
        }
      />
    </section>
  )
}

function LinkRow({
  link,
  first,
  last,
  busy,
  compact,
  onUp,
  onDown,
  onSave,
  onDelete,
}: {
  link: ReferenceLinkView
  first: boolean
  last: boolean
  busy: boolean
  compact?: boolean
  onUp: () => void
  onDown: () => void
  onSave: (patch: { url?: string; label?: string; note?: string | null }) => void
  onDelete: () => void
}) {
  const [editing, setEditing] = React.useState(false)
  const [label, setLabel] = React.useState(link.label)
  const [url, setUrl] = React.useState(link.url)
  const [note, setNote] = React.useState(link.note ?? "")

  if (editing) {
    return (
      <li className="flex flex-col gap-1.5 p-2">
        <Input className="h-8" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Nhãn" />
        <Input className="h-8" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" />
        <Input className="h-8" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ghi chú (tuỳ chọn)" />
        <div className="flex gap-1">
          <Button
            size="xs"
            disabled={busy || !label.trim() || !url.trim()}
            onClick={() => {
              onSave({ label: label.trim(), url: url.trim(), note: note.trim() || null })
              setEditing(false)
            }}
          >
            Lưu
          </Button>
          <Button size="xs" variant="ghost" onClick={() => setEditing(false)}>
            Huỷ
          </Button>
        </div>
      </li>
    )
  }

  return (
    <li className="flex items-center gap-2 p-2">
      <a
        href={link.url}
        target="_blank"
        rel="noreferrer"
        className="flex min-w-0 flex-1 items-center gap-1 text-sm text-primary hover:underline"
        title={link.url}
      >
        <span className="truncate">{link.label}</span>
        <ExternalLinkIcon className="size-3.5 shrink-0" />
      </a>
      {!compact && link.note && (
        <span className="hidden max-w-40 truncate text-xs text-muted-foreground sm:inline">
          {link.note}
        </span>
      )}
      <div className="flex shrink-0 items-center">
        <Button size="icon-xs" variant="ghost" disabled={busy || first} onClick={onUp} aria-label="Lên">
          <ArrowUpIcon />
        </Button>
        <Button size="icon-xs" variant="ghost" disabled={busy || last} onClick={onDown} aria-label="Xuống">
          <ArrowDownIcon />
        </Button>
        <Button size="icon-xs" variant="ghost" onClick={() => setEditing(true)} aria-label="Sửa">
          <PencilIcon />
        </Button>
        <Button
          size="icon-xs"
          variant="ghost"
          className="text-muted-foreground hover:text-destructive"
          disabled={busy}
          onClick={onDelete}
          aria-label="Xoá"
        >
          <Trash2Icon />
        </Button>
      </div>
    </li>
  )
}

function NewLinkRow({
  busy,
  onAdd,
}: {
  busy: boolean
  onAdd: (url: string, label: string, note: string | null) => void
}) {
  const [open, setOpen] = React.useState(false)
  const [label, setLabel] = React.useState("")
  const [url, setUrl] = React.useState("")
  const [note, setNote] = React.useState("")

  if (!open) {
    return (
      <Button size="xs" variant="outline" className="self-start" onClick={() => setOpen(true)}>
        <PlusIcon /> Thêm link
      </Button>
    )
  }

  return (
    <div className="flex flex-col gap-1.5 rounded-lg border p-2">
      <Input className="h-8" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Nhãn *, vd 'Timeline chi tiết'" autoFocus />
      <Input className="h-8" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://… *" />
      <Input className="h-8" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ghi chú (tuỳ chọn)" />
      <div className="flex gap-1">
        <Button
          size="xs"
          disabled={busy || !label.trim() || !url.trim()}
          onClick={() => {
            onAdd(url.trim(), label.trim(), note.trim() || null)
            setLabel("")
            setUrl("")
            setNote("")
            setOpen(false)
          }}
        >
          Thêm
        </Button>
        <Button size="xs" variant="ghost" onClick={() => setOpen(false)}>
          Huỷ
        </Button>
      </div>
    </div>
  )
}
