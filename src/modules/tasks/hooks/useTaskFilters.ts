"use client"

import * as React from "react"

import type { TaskPriority } from "@/constants/priority"
import type { TaskStatus } from "@/constants/status"
import type { Task } from "@/modules/tasks/types/task.types"

export type TaskSortBy = "createdAt" | "dueDate" | "priority"

export interface TaskFiltersState {
  search: string
  status: TaskStatus | "all"
  priority: TaskPriority | "all"
  assigneeId: string | "all"
  sortBy: TaskSortBy
}

const DEFAULT_FILTERS: TaskFiltersState = {
  search: "",
  status: "all",
  priority: "all",
  assigneeId: "all",
  sortBy: "createdAt",
}

const PRIORITY_WEIGHT: Record<TaskPriority, number> = { low: 0, medium: 1, high: 2 }

export function useTaskFilters(tasks: Task[]) {
  const [filters, setFilters] = React.useState<TaskFiltersState>(DEFAULT_FILTERS)

  const assigneeOptions = React.useMemo(() => {
    const ids = new Set<string>()
    tasks.forEach((task) => {
      if (task.assigneeId) ids.add(task.assigneeId)
    })
    return Array.from(ids)
  }, [tasks])

  const filtered = React.useMemo(() => {
    const search = filters.search.trim().toLowerCase()

    const result = tasks.filter((task) => {
      const matchesSearch =
        !search ||
        task.title.toLowerCase().includes(search) ||
        (task.description ?? "").toLowerCase().includes(search) ||
        (task.assigneeId ?? "").toLowerCase().includes(search)
      const matchesStatus = filters.status === "all" || task.status === filters.status
      const matchesPriority = filters.priority === "all" || task.priority === filters.priority
      const matchesAssignee =
        filters.assigneeId === "all" || task.assigneeId === filters.assigneeId
      return matchesSearch && matchesStatus && matchesPriority && matchesAssignee
    })

    return [...result].sort((a, b) => {
      if (filters.sortBy === "dueDate") {
        const aTime = a.dueDate?.toMillis() ?? Number.POSITIVE_INFINITY
        const bTime = b.dueDate?.toMillis() ?? Number.POSITIVE_INFINITY
        return aTime - bTime
      }
      if (filters.sortBy === "priority") {
        return PRIORITY_WEIGHT[b.priority] - PRIORITY_WEIGHT[a.priority]
      }
      const aTime = a.createdAt?.toMillis() ?? 0
      const bTime = b.createdAt?.toMillis() ?? 0
      return bTime - aTime
    })
  }, [tasks, filters])

  return { filters, setFilters, filtered, assigneeOptions }
}
