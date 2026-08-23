"use client"

import * as React from "react"

import { addComment, subscribeToComments } from "@/modules/tasks/services/tasks.service"
import type { TaskComment } from "@/modules/tasks/types/task.types"

export function useTaskComments(taskId: string) {
  const [comments, setComments] = React.useState<TaskComment[]>([])

  React.useEffect(() => {
    const unsubscribe = subscribeToComments(taskId, setComments)
    return unsubscribe
  }, [taskId])

  async function postComment(authorId: string, content: string) {
    if (!content.trim()) return
    await addComment(taskId, { authorId, content: content.trim() })
  }

  return { comments, postComment }
}
