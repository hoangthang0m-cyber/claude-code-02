"use client"

import { TaskDetailBody } from "@/modules/tasks/components/TaskDetailBody"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"

export function TaskDetailDrawer({
  taskId,
  open,
  onOpenChange,
}: {
  taskId: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full gap-4 overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>Chi tiết công việc</SheetTitle>
        </SheetHeader>
        {taskId && (
          <TaskDetailBody taskId={taskId} onDeleted={() => onOpenChange(false)} />
        )}
      </SheetContent>
    </Sheet>
  )
}
