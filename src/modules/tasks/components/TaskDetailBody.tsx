"use client"

import * as React from "react"
import { Timestamp } from "firebase/firestore"

import { deleteTask, updateTask } from "@/modules/tasks/services/tasks.service"
import { TaskAttachments } from "@/modules/tasks/components/TaskAttachments"
import { TaskComments } from "@/modules/tasks/components/TaskComments"
import { useTask } from "@/modules/tasks/hooks/useTask"
import type { Task } from "@/modules/tasks/types/task.types"
import { Button } from "@/components/ui/button"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Textarea } from "@/components/ui/textarea"
import { TASK_PRIORITIES, TASK_PRIORITY_LABELS } from "@/constants/priority"
import { TASK_STATUSES, TASK_STATUS_LABELS } from "@/constants/status"
import { Trash2Icon } from "lucide-react"

function toDateInputValue(timestamp?: Timestamp) {
  if (!timestamp) return ""
  return timestamp.toDate().toISOString().slice(0, 10)
}

export function TaskDetailBody({
  taskId,
  onDeleted,
}: {
  taskId: string
  onDeleted?: () => void
}) {
  const { task, loading } = useTask(taskId)

  if (loading) {
    return <p className="px-4 text-sm text-muted-foreground">Đang tải...</p>
  }

  if (!task) {
    return <p className="px-4 text-sm text-muted-foreground">Không tìm thấy công việc.</p>
  }

  return <TaskDetailFields key={task.id} task={task} onDeleted={onDeleted} />
}

function TaskDetailFields({
  task,
  onDeleted,
}: {
  task: Task
  onDeleted?: () => void
}) {
  const [title, setTitle] = React.useState(task.title)
  const [description, setDescription] = React.useState(task.description ?? "")
  const [assigneeId, setAssigneeId] = React.useState(task.assigneeId ?? "")
  const [tags, setTags] = React.useState((task.tags ?? []).join(", "))

  function saveField(data: Parameters<typeof updateTask>[1]) {
    updateTask(task.id, data)
  }

  async function handleDelete() {
    await deleteTask(task.id)
    onDeleted?.()
  }

  return (
    <div className="flex flex-1 flex-col gap-4 px-4 pb-4">
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="detail-title">Title</FieldLabel>
          <Input
            id="detail-title"
            value={title}
            maxLength={200}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => title.trim() && saveField({ title: title.trim() })}
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field>
            <FieldLabel>Status</FieldLabel>
            <Select
              value={task.status}
              onValueChange={(value) => saveField({ status: value as typeof task.status })}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TASK_STATUSES.map((status) => (
                  <SelectItem key={status} value={status}>
                    {TASK_STATUS_LABELS[status]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel>Priority</FieldLabel>
            <Select
              value={task.priority}
              onValueChange={(value) =>
                saveField({ priority: value as typeof task.priority })
              }
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TASK_PRIORITIES.map((priority) => (
                  <SelectItem key={priority} value={priority}>
                    {TASK_PRIORITY_LABELS[priority]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field>
            <FieldLabel htmlFor="detail-assignee">Assignee</FieldLabel>
            <Input
              id="detail-assignee"
              value={assigneeId}
              onChange={(e) => setAssigneeId(e.target.value)}
              onBlur={() => saveField({ assigneeId })}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="detail-due-date">Due date</FieldLabel>
            <Input
              id="detail-due-date"
              type="date"
              defaultValue={toDateInputValue(task.dueDate)}
              onChange={(e) =>
                saveField({
                  dueDate: e.target.value
                    ? Timestamp.fromDate(new Date(e.target.value))
                    : undefined,
                })
              }
            />
          </Field>
        </div>

        <Field>
          <FieldLabel htmlFor="detail-description">Description</FieldLabel>
          <Textarea
            id="detail-description"
            rows={4}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            onBlur={() => saveField({ description })}
          />
        </Field>

        <Field>
          <FieldLabel htmlFor="detail-tags">Tags (phân cách bằng dấu phẩy)</FieldLabel>
          <Input
            id="detail-tags"
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            onBlur={() =>
              saveField({
                tags: tags.split(",").map((tag) => tag.trim()).filter(Boolean),
              })
            }
          />
        </Field>
      </FieldGroup>

      <Separator />
      <TaskAttachments taskId={task.id} attachments={task.attachments ?? []} />

      <Separator />
      <TaskComments taskId={task.id} />

      <Separator />
      <Button variant="destructive" onClick={handleDelete}>
        <Trash2Icon />
        Xóa công việc
      </Button>
    </div>
  )
}
