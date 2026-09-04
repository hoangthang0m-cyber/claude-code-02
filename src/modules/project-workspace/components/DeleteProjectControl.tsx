"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { Trash2Icon } from "lucide-react"
import { toast } from "sonner"

import { deleteProject } from "@/modules/project-workspace/services/projects.client"
import { Button } from "@/components/ui/button"

// Hard delete (user-approved, not in SPEC). Manager-only; the caller must
// re-type the project name. Cascades every child doc server-side.
export function DeleteProjectControl({
  projectId,
  projectName,
}: {
  projectId: string
  projectName: string
}) {
  const router = useRouter()
  const [busy, setBusy] = React.useState(false)

  async function handleDelete() {
    const typed = window
      .prompt(
        `Xoá vĩnh viễn dự án này? Toàn bộ hạng mục, lịch sử, bình luận và số ` +
          `liệu ads sẽ mất và KHÔNG khôi phục được.\n\nGõ đúng tên dự án để xác ` +
          `nhận:\n${projectName}`
      )
      ?.trim()
    if (!typed) return
    if (typed !== projectName.trim()) {
      toast.error("Tên không khớp — đã huỷ")
      return
    }

    setBusy(true)
    try {
      const r = await deleteProject(projectId, typed)
      toast.success(
        `Đã xoá dự án — ${r.content_items_deleted} hạng mục, ${r.docs_deleted} bản ghi`
      )
      router.push("/campaigns")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Không xoá được")
      setBusy(false)
    }
  }

  return (
    <section className="flex flex-col gap-2 rounded-lg border border-destructive/40 p-4">
      <h2 className="text-sm font-semibold text-destructive">Vùng nguy hiểm</h2>
      <p className="text-xs text-muted-foreground">
        Xoá dự án là vĩnh viễn và xoá kèm mọi dữ liệu con. Nếu chỉ muốn ẩn đi, hãy
        dùng “Lưu trữ” ở trên.
      </p>
      <Button
        variant="destructive"
        size="sm"
        className="w-fit"
        disabled={busy}
        onClick={handleDelete}
      >
        <Trash2Icon className="size-4" />
        {busy ? "Đang xoá…" : "Xoá dự án vĩnh viễn"}
      </Button>
    </section>
  )
}
