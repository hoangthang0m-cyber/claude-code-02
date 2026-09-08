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

import {
  REFERENCE_LINK_WARN_COUNT,
  type KnowledgeLinkSection,
  type KnowledgeLinkView,
} from "@/lib/domain"
import {
  addKnowledgeLink,
  deleteKnowledgeLink,
  reorderKnowledgeLinks,
  updateKnowledgeLink,
} from "@/modules/knowledge/services/knowledge.client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

// Links of one entry section (phỏng theo ReferenceLinksPanel). The list itself
// comes from the parent's onSnapshot; these handlers just call the API and let
// the snapshot refresh. `editable` false → read-only (archived entry).
export function KnowledgeLinksPanel({
  entryId,
  section,
  links,
  editable,
}: {
  entryId: string
  section: KnowledgeLinkSection
  links: KnowledgeLinkView[]
  editable: boolean
}) {
  const [busy, setBusy] = React.useState(false)

  async function run(p: Promise<unknown>, ok: string) {
    setBusy(true)
    try {
      await p
      toast.success(ok)
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
      reorderKnowledgeLinks(entryId, {
        section,
        ordered_ids: next.map((l) => l.id),
      }),
      "Đã đổi thứ tự"
    )
  }

  return (
    <div className="flex flex-col gap-2">
      {links.length > REFERENCE_LINK_WARN_COUNT && (
        <p className="text-xs text-amber-600 dark:text-amber-500">
          Đang có nhiều link ({links.length}) — nên gộp / dọn bớt.
        </p>
      )}

      {links.length === 0 ? (
        <p className="text-sm text-muted-foreground">Chưa có link.</p>
      ) : (
        <ul className="flex flex-col divide-y rounded-lg border">
          {links.map((link, i) => (
            <LinkRow
              key={link.id}
              link={link}
              first={i === 0}
              last={i === links.length - 1}
              busy={busy}
              editable={editable}
              onUp={() => move(i, -1)}
              onDown={() => move(i, 1)}
              onSave={(patch) =>
                run(updateKnowledgeLink(link.id, patch), "Đã lưu link")
              }
              onDelete={() =>
                run(deleteKnowledgeLink(link.id), "Đã xoá link")
              }
            />
          ))}
        </ul>
      )}

      {editable && (
        <NewLinkRow
          busy={busy}
          onAdd={(url, label, note) =>
            run(
              addKnowledgeLink(entryId, { section, url, label, note }),
              "Đã thêm link"
            )
          }
        />
      )}
    </div>
  )
}

function LinkRow({
  link,
  first,
  last,
  busy,
  editable,
  onUp,
  onDown,
  onSave,
  onDelete,
}: {
  link: KnowledgeLinkView
  first: boolean
  last: boolean
  busy: boolean
  editable: boolean
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
        rel="noopener noreferrer"
        className="flex min-w-0 flex-1 items-center gap-1 text-sm text-primary hover:underline"
        title={link.url}
      >
        <span className="truncate">{link.label}</span>
        <ExternalLinkIcon className="size-3.5 shrink-0" />
      </a>
      {link.note && (
        <span className="hidden max-w-40 truncate text-xs text-muted-foreground sm:inline">
          {link.note}
        </span>
      )}
      {editable && (
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
      )}
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
      <Input className="h-8" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Nhãn *, vd 'Bảng số liệu gốc'" autoFocus />
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
