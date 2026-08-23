import Link from "next/link"

import { TaskDetailBody } from "@/modules/tasks/components/TaskDetailBody"
import { ArrowLeftIcon } from "lucide-react"

export default async function TaskDetailPage({
  params,
}: {
  params: Promise<{ taskId: string }>
}) {
  const { taskId } = await params

  return (
    <div className="flex flex-col gap-4 px-4 py-4 md:px-6 md:py-6">
      <Link
        href="/tasks"
        className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeftIcon className="size-4" />
        Back to tasks
      </Link>
      <TaskDetailBody taskId={taskId} />
    </div>
  )
}
