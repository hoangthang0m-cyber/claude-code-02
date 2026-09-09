"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  ArchiveIcon,
  ArchiveRestoreIcon,
  ArrowLeftIcon,
  PencilIcon,
  Trash2Icon,
} from "lucide-react"
import { toast } from "sonner"

import { useAuth } from "@/context/AuthContext"
import {
  KNOWLEDGE_LIFECYCLE_LABELS,
  isKnowledgeEntryWritable,
} from "@/lib/domain"
import {
  deleteKnowledgeEntry,
  setKnowledgeEntryLifecycle,
} from "@/modules/knowledge/services/knowledge.client"
import { useKnowledgeEntry } from "@/modules/knowledge/hooks/useKnowledgeEntry"
import { KnowledgeEntryFormSheet } from "@/modules/knowledge/components/KnowledgeEntryFormSheet"
import { KnowledgeLinksPanel } from "@/modules/knowledge/components/KnowledgeLinksPanel"
import { KnowledgeProjectRefPanel } from "@/modules/knowledge/components/KnowledgeProjectRefPanel"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"

export function KnowledgeEntryView({ entryId }: { entryId: string }) {
  const router = useRouter()
  const { profile } = useAuth()
  const isManager = profile?.system_role === "manager"
  const { entry, notFound, links, refs, loading } = useKnowledgeEntry(entryId)
  const [busy, setBusy] = React.useState(false)

  if (notFound) {
    return (
      <p className="text-sm text-muted-foreground">
        Không tìm thấy tri thức này.
      </p>
    )
  }
  if (loading || !entry) {
    return <Skeleton className="h-64 rounded-xl" />
  }

  const editable = isKnowledgeEntryWritable(entry.lifecycle)

  async function toggleArchive(target: "active" | "archived") {
    setBusy(true)
    try {
      await setKnowledgeEntryLifecycle(entryId, target)
      toast.success(target === "archived" ? "Đã lưu trữ" : "Đã bỏ lưu trữ")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Lỗi")
    } finally {
      setBusy(false)
    }
  }

  async function remove(name: string) {
    const typed = window
      .prompt(
        `Xoá vĩnh viễn tri thức này? Toàn bộ link và tham chiếu sẽ mất, KHÔNG ` +
          `khôi phục được.\n\nGõ đúng tên để xác nhận:\n${name}`
      )
      ?.trim()
    if (!typed) return
    if (typed !== name.trim()) {
      toast.error("Tên không khớp — đã huỷ")
      return
    }
    setBusy(true)
    try {
      await deleteKnowledgeEntry(entryId, typed)
      toast.success(`Đã xoá "${name}"`)
      router.push("/knowledge")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Không xoá được")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-5 md:gap-6">
      <Link
        href="/knowledge"
        className="flex w-fit items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeftIcon className="size-4" /> Danh sách tri thức
      </Link>

      {/* 1. Tên + trạng thái + hành động */}
      <Panel className="gap-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-2xl font-semibold tracking-tight">
              {entry.name}
            </h1>
            {entry.lifecycle === "archived" && (
              <Badge variant="secondary">
                {KNOWLEDGE_LIFECYCLE_LABELS.archived}
              </Badge>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {editable && (
              <KnowledgeEntryFormSheet
                mode="edit"
                entry={entry}
                trigger={
                  <Button variant="outline" size="sm">
                    <PencilIcon className="size-4" /> Sửa
                  </Button>
                }
              />
            )}
            {isManager && (
              <Button
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={() =>
                  toggleArchive(editable ? "archived" : "active")
                }
              >
                {editable ? (
                  <>
                    <ArchiveIcon className="size-4" /> Lưu trữ
                  </>
                ) : (
                  <>
                    <ArchiveRestoreIcon className="size-4" /> Bỏ lưu trữ
                  </>
                )}
              </Button>
            )}
            {isManager && (
              <Button
                variant="outline"
                size="sm"
                className="text-destructive hover:text-destructive"
                disabled={busy}
                onClick={() => remove(entry.name)}
              >
                <Trash2Icon className="size-4" /> Xoá
              </Button>
            )}
          </div>
        </div>
        {!editable && (
          <p className="text-xs text-muted-foreground">
            Tri thức đã lưu trữ — chỉ đọc. Bỏ lưu trữ để sửa lại.
          </p>
        )}
      </Panel>

      {/* 2. Mô tả tổng quan */}
      <Panel>
        <SectionHeading n={2}>Mô tả tổng quan</SectionHeading>
        <p className="text-sm leading-relaxed whitespace-pre-wrap">
          {entry.overview}
        </p>
      </Panel>

      {/* 3. Mô tả chi tiết */}
      <Panel>
        <SectionHeading n={3}>Mô tả chi tiết</SectionHeading>
        <SectionNote value={entry.detail_note} />
        <div className="border-t pt-3">
          <p className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Tài liệu đính kèm
          </p>
          <KnowledgeLinksPanel
            entryId={entryId}
            section="detail"
            links={links.detail}
            editable={editable}
          />
        </div>
      </Panel>

      {/* 4. Quá trình đúc kết */}
      <Panel>
        <SectionHeading n={4}>Quá trình đúc kết</SectionHeading>
        <SectionNote value={entry.process_note} />
        <div className="border-t pt-3">
          <p className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Dự án / Nhóm dự án liên quan
          </p>
          <KnowledgeProjectRefPanel
            entryId={entryId}
            refs={refs}
            editable={editable}
          />
        </div>
        <div className="border-t pt-3">
          <p className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Tài liệu đính kèm
          </p>
          <KnowledgeLinksPanel
            entryId={entryId}
            section="process"
            links={links.process}
            editable={editable}
          />
        </div>
      </Panel>

      {/* 5. Đúc kết */}
      <Panel>
        <SectionHeading n={5}>Đúc kết</SectionHeading>
        <SectionNote value={entry.conclusion_note} />
        <div className="border-t pt-3">
          <p className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Tài liệu đính kèm
          </p>
          <KnowledgeLinksPanel
            entryId={entryId}
            section="conclusion"
            links={links.conclusion}
            editable={editable}
          />
        </div>
      </Panel>
    </div>
  )
}

function Panel({
  className,
  children,
}: {
  className?: string
  children: React.ReactNode
}) {
  return (
    <div
      className={
        "mystic-panel flex flex-col gap-3 rounded-2xl bg-card p-4 text-card-foreground ring-1 ring-foreground/10 md:p-5 " +
        (className ?? "")
      }
    >
      {children}
    </div>
  )
}

function SectionHeading({
  n,
  children,
}: {
  n: number
  children: React.ReactNode
}) {
  return (
    <h2 className="flex items-center gap-2.5 font-heading text-[1.0625rem] font-semibold tracking-[-0.01em]">
      {/* số thứ tự trong viên đá xoay 45° — nhịp thị giác của trang tri thức */}
      <span className="flex size-6 rotate-45 items-center justify-center rounded-[0.4rem] bg-[linear-gradient(140deg,color-mix(in_oklch,var(--primary),white_12%),var(--primary))] text-primary-foreground shadow-[0_1px_0_0_var(--sheen)_inset,0_4px_12px_-4px_color-mix(in_oklch,var(--primary),transparent_40%)]">
        <span className="-rotate-45 font-sans text-[0.6875rem] font-bold">
          {n}
        </span>
      </span>
      {children}
    </h2>
  )
}

function SectionNote({ value }: { value?: string }) {
  if (!value || !value.trim()) {
    return (
      <p className="text-sm text-muted-foreground italic">
        (chưa nhập)
      </p>
    )
  }
  return (
    <p className="text-sm leading-relaxed whitespace-pre-wrap">{value}</p>
  )
}
