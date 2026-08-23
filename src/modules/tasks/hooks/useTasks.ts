"use client"

import * as React from "react"

import { subscribeToTasks } from "@/modules/tasks/services/tasks.service"
import type { Task } from "@/types/task"

export function useTasks() {
  const [tasks, setTasks] = React.useState<Task[]>([])
  const [loading, setLoading] = React.useState(true)

  React.useEffect(() => {
    const unsubscribe = subscribeToTasks((items) => {
      setTasks(items)
      setLoading(false)
    })
    return unsubscribe
  }, [])

  return { tasks, loading }
}
