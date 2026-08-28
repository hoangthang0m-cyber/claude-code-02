"use client"

import * as React from "react"
import { PlusIcon } from "lucide-react"
import { toast } from "sonner"

import {
  CONTENT_STATUSES,
  CONTENT_STATUS_LABELS,
  type ContentStatus,
} from "@/lib/domain"
import { useUsers } from "@/hooks/useUsers"
import { useContentItems } from "@/modules/content-pipeline/hooks/useContentItems"
import { useProjectMembers } from "@/modules/project-workspace/hooks/useProjectMembers"
import { createContentItem } from "@/modules/content-pipeline/services/content.client"
import { ContentBoard } from "@/modules/content-pipeline/components/ContentBoard"
import { ContentRow } from "@/modules/content-pipeline/components/ContentRow"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"

const COLUMNS = [
  "Mã",
  "Deadline",
  "Nhân sự",
  "Kịch bản",
  "Video",
  "Trạng thái",
  "Chủ đề",
  "Định dạng",
  "Research KH",
  "Báo cáo ads",
  "Đánh giá",
]

export function ContentTable({
  projectId,
  editable,
}: {
  projectId: string
  editable: boolean
}) {
  const [view, setView] = React.useState<"table" | "board">("table")
  const [assignee, setAssignee] = React.useState<string>("all")
  const [status, setStatus] = React.useState<string>("all")
  const [topic, setTopic] = React.useState("")
  const [overdue, setOverdue] = React.useState(false)
  const [sort, setSort] = React.useState<"deadline" | "updated_at">("updated_at")
  const [newCode, setNewCode] = React.useState("")
  const [adding, setAdding] = React.useState(false)

  const params = React.useMemo(
    () => ({
      assignee: assignee === "all" ? undefined : assignee,
      status: status === "all" ? undefined : status,
      topic: topic.trim() || undefined,
      overdue: overdue || undefined,
      sort,
    }),
    [assignee, status, topic, overdue, sort]
  )

  const { items, loading, error, refresh } = useContentItems(projectId, params)
  const { members } = useProjectMembers(projectId)
  const { users } = useUsers()

  const memberOptions = (members ?? []).map((m) => ({
    user_id: m.user_id,
    name: users.find((u) => u.id === m.user_id)?.name ?? m.user_id,
  }))

  async function addItem(e: React.FormEvent) {
    e.preventDefault()
    if (!newCode.trim()) return
    setAdding(true)
    try {
      await createContentItem(projectId, newCode.trim())
      setNewCode("")
      toast.success("Đã thêm hạng mục")
      refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Không thêm được")
    } finally {
      setAdding(false)
    }
  }

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Hạng mục nội dung</h2>
        <ToggleGroup
          value={[view]}
          onValueChange={(v) => {
            const next = v[0]
            if (next === "table" || next === "board") setView(next)
          }}
        >
          <ToggleGroupItem value="table">Bảng</ToggleGroupItem>
          <ToggleGroupItem value="board">Kanban</ToggleGroupItem>
        </ToggleGroup>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Select value={assignee} onValueChange={(v) => v && setAssignee(v)}>
          <SelectTrigger size="sm" className="w-40">
            <SelectValue placeholder="Nhân sự" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tất cả nhân sự</SelectItem>
            <SelectItem value="none">Chưa gán</SelectItem>
            {memberOptions.map((m) => (
              <SelectItem key={m.user_id} value={m.user_id}>
                {m.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={status} onValueChange={(v) => v && setStatus(v)}>
          <SelectTrigger size="sm" className="w-44">
            <SelectValue placeholder="Trạng thái" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tất cả trạng thái</SelectItem>
            {CONTENT_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {CONTENT_STATUS_LABELS[s as ContentStatus]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Input
          className="h-8 w-40"
          placeholder="Chủ đề"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
        />

        <label className="flex items-center gap-1.5 text-sm">
          <Checkbox
            checked={overdue}
            onCheckedChange={(c) => setOverdue(c === true)}
          />
          Quá hạn
        </label>

        <Select
          value={sort}
          onValueChange={(v) => v && setSort(v as "deadline" | "updated_at")}
        >
          <SelectTrigger size="sm" className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="updated_at">Cập nhật gần nhất</SelectItem>
            <SelectItem value="deadline">Deadline</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {view === "board" ? (
        <ContentBoard items={items ?? []} members={memberOptions} />
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader className="bg-muted">
              <TableRow>
                {COLUMNS.map((c) => (
                  <TableHead key={c}>{c}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <td
                    colSpan={COLUMNS.length}
                    className="h-16 text-center text-sm text-muted-foreground"
                  >
                    Đang tải...
                  </td>
                </TableRow>
              ) : items && items.length > 0 ? (
                items.map((item) => (
                  <ContentRow
                    key={item.id}
                    item={item}
                    members={memberOptions}
                    editable={editable}
                    onChanged={refresh}
                  />
                ))
              ) : (
                <TableRow>
                  <td
                    colSpan={COLUMNS.length}
                    className="h-16 text-center text-sm text-muted-foreground"
                  >
                    Chưa có hạng mục nào.
                  </td>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      )}

      {editable && (
        <form onSubmit={addItem} className="flex items-center gap-2">
          <Input
            className="h-8 w-56"
            placeholder="Mã / tên hạng mục"
            value={newCode}
            onChange={(e) => setNewCode(e.target.value)}
          />
          <Button type="submit" size="sm" disabled={adding || !newCode.trim()}>
            <PlusIcon className="size-4" /> Thêm hạng mục
          </Button>
        </form>
      )}
    </section>
  )
}
