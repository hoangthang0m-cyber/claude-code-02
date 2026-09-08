"use client"

import * as React from "react"
import {
  ExternalLinkIcon,
  PencilIcon,
  PlusIcon,
  Trash2Icon,
} from "lucide-react"
import { toast } from "sonner"

import {
  ORG_DOCUMENT_CATEGORIES,
  ORG_DOCUMENT_CATEGORY_LABELS,
  ORG_DOCUMENT_SORTS,
  filterAndSortOrgDocuments,
  type OrgDocumentCategory,
  type OrgDocumentSort,
  type OrgDocumentView,
} from "@/lib/domain"
import {
  createOrgDocument,
  deleteOrgDocument,
  updateOrgDocument,
} from "@/modules/document-library/services/orgDocuments.client"
import { useOrgDocuments } from "@/modules/document-library/hooks/useOrgDocuments"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs"

const SORT_LABELS: Record<OrgDocumentSort, string> = {
  doc_date: "Theo ngày",
  updated_at: "Cập nhật gần nhất",
}

const EMPTY_TEXT: Record<OrgDocumentCategory, string> = {
  meeting_minutes: "Chưa có biên bản họp nào.",
  org_document: "Chưa có tài liệu nào.",
}

export function DocumentLibraryView() {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold">Tài liệu</h1>
        <p className="text-sm text-muted-foreground">
          Kho link biên bản họp và tài liệu tổ chức. Hệ thống chỉ lưu và mở
          link — không đọc nội dung, không đồng bộ.
        </p>
      </div>

      <Tabs defaultValue={ORG_DOCUMENT_CATEGORIES[0]}>
        <TabsList>
          {ORG_DOCUMENT_CATEGORIES.map((c) => (
            <TabsTrigger key={c} value={c}>
              {ORG_DOCUMENT_CATEGORY_LABELS[c]}
            </TabsTrigger>
          ))}
        </TabsList>
        {ORG_DOCUMENT_CATEGORIES.map((c) => (
          <TabsContent key={c} value={c} className="pt-3">
            <LibrarySection category={c} />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  )
}

function LibrarySection({ category }: { category: OrgDocumentCategory }) {
  const { items, loading, error, refresh } = useOrgDocuments(category)
  const [q, setQ] = React.useState("")
  const [sort, setSort] = React.useState<OrgDocumentSort>("doc_date")
  const [adding, setAdding] = React.useState(false)
  const [busy, setBusy] = React.useState(false)

  const shown = React.useMemo(
    () => filterAndSortOrgDocuments(items, { q, sort }),
    [items, q, sort]
  )

  async function run(p: Promise<unknown>, ok: string) {
    setBusy(true)
    try {
      await p
      toast.success(ok)
      refresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Thất bại")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          className="h-8 w-56"
          placeholder="Tìm theo tiêu đề…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <Select
          value={sort}
          onValueChange={(v) => v && setSort(v as OrgDocumentSort)}
        >
          <SelectTrigger size="sm" className="w-44">
            <SelectValue>{SORT_LABELS[sort]}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {ORG_DOCUMENT_SORTS.map((s) => (
              <SelectItem key={s} value={s}>
                {SORT_LABELS[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          size="sm"
          className="ml-auto"
          onClick={() => setAdding((a) => !a)}
        >
          <PlusIcon /> Thêm
        </Button>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {adding && (
        <DocForm
          busy={busy}
          onCancel={() => setAdding(false)}
          onSubmit={async (values) => {
            await run(
              createOrgDocument({ category, ...values }),
              "Đã thêm"
            )
            setAdding(false)
          }}
        />
      )}

      {loading ? (
        <Skeleton className="h-24 rounded-lg" />
      ) : shown.length === 0 ? (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          {q.trim()
            ? "Không có mục nào khớp."
            : EMPTY_TEXT[category]}
        </p>
      ) : (
        <ul className="flex flex-col divide-y rounded-lg border">
          {shown.map((doc) => (
            <DocRow
              key={doc.id}
              doc={doc}
              busy={busy}
              onSave={(values) =>
                run(updateOrgDocument(doc.id, values), "Đã lưu")
              }
              onDelete={() =>
                run(deleteOrgDocument(doc.id), "Đã xoá")
              }
            />
          ))}
        </ul>
      )}
    </div>
  )
}

function fmtDate(d: string | null): string | null {
  if (!d) return null
  const parsed = new Date(`${d}T00:00:00Z`)
  return Number.isNaN(parsed.getTime())
    ? d
    : parsed.toLocaleDateString("vi-VN")
}

function DocRow({
  doc,
  busy,
  onSave,
  onDelete,
}: {
  doc: OrgDocumentView
  busy: boolean
  onSave: (values: FormValues) => void
  onDelete: () => void
}) {
  const [editing, setEditing] = React.useState(false)

  if (editing) {
    return (
      <li className="p-2">
        <DocForm
          busy={busy}
          initial={{
            title: doc.title,
            url: doc.url,
            doc_date: doc.doc_date ?? "",
            note: doc.note ?? "",
          }}
          onCancel={() => setEditing(false)}
          onSubmit={(values) => {
            onSave(values)
            setEditing(false)
          }}
        />
      </li>
    )
  }

  const date = fmtDate(doc.doc_date)
  return (
    <li className="flex items-start gap-2 p-3">
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <a
          href={doc.url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex w-fit items-center gap-1 text-sm font-medium text-primary hover:underline"
          title={doc.url}
        >
          <span className="truncate">{doc.title}</span>
          <ExternalLinkIcon className="size-3.5 shrink-0" />
        </a>
        <div className="flex flex-wrap gap-x-3 text-xs text-muted-foreground">
          {date && <span>{date}</span>}
          {doc.note && <span className="whitespace-pre-wrap">{doc.note}</span>}
        </div>
      </div>
      <div className="flex shrink-0 items-center">
        <Button
          variant="ghost"
          size="icon-xs"
          disabled={busy}
          onClick={() => setEditing(true)}
          aria-label="Sửa"
        >
          <PencilIcon />
        </Button>
        <Button
          variant="ghost"
          size="icon-xs"
          className="text-muted-foreground hover:text-destructive"
          disabled={busy}
          onClick={() => {
            if (window.confirm(`Xoá "${doc.title}"?`)) onDelete()
          }}
          aria-label="Xoá"
        >
          <Trash2Icon />
        </Button>
      </div>
    </li>
  )
}

interface FormValues {
  title: string
  url: string
  doc_date?: string | null
  note?: string | null
}

function DocForm({
  initial,
  busy,
  onSubmit,
  onCancel,
}: {
  initial?: { title: string; url: string; doc_date: string; note: string }
  busy: boolean
  onSubmit: (values: FormValues) => void
  onCancel: () => void
}) {
  const [title, setTitle] = React.useState(initial?.title ?? "")
  const [url, setUrl] = React.useState(initial?.url ?? "")
  const [docDate, setDocDate] = React.useState(initial?.doc_date ?? "")
  const [note, setNote] = React.useState(initial?.note ?? "")

  function submit() {
    if (!title.trim()) {
      toast.error("Cần nhập tiêu đề")
      return
    }
    if (!url.trim()) {
      toast.error("Cần nhập link")
      return
    }
    onSubmit({
      title: title.trim(),
      url: url.trim(),
      doc_date: docDate.trim() || null,
      note: note.trim() || null,
    })
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border bg-muted/30 p-3">
      <Input
        className="h-8"
        placeholder="Tiêu đề *"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        autoFocus
      />
      <Input
        className="h-8"
        placeholder="Link (https://…) *"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
      />
      <div className="flex flex-wrap gap-2">
        <Input
          type="date"
          className="h-8 w-40"
          value={docDate}
          onChange={(e) => setDocDate(e.target.value)}
        />
        <Input
          className="h-8 flex-1"
          placeholder="Ghi chú (tuỳ chọn)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </div>
      <div className="flex gap-1">
        <Button size="xs" disabled={busy} onClick={submit}>
          Lưu
        </Button>
        <Button size="xs" variant="ghost" onClick={onCancel}>
          Huỷ
        </Button>
      </div>
    </div>
  )
}
