"use client"

import * as React from "react"

import { subscribeToTask } from "@/modules/tasks/services/tasks.service"
import type { Task } from "@/modules/tasks/types/task.types"

export function useTask(taskId: string) {
  const [task, setTask] = React.useState<Task | null>(null)
  const [loading, setLoading] = React.useState(true)

  React.useEffect(() => {
    const unsubscribe = subscribeToTask(taskId, (nextTask) => {
      setTask(nextTask)
      setLoading(false)
    })
    return unsubscribe
  }, [taskId])

  return { task, loading }
}
