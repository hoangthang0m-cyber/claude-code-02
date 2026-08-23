"use client"

import * as React from "react"

import { useAuth } from "@/context/AuthContext"
import { createTask } from "@/modules/tasks/services/tasks.service"
import type { TaskFormValues } from "@/modules/tasks/types"
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
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import { TASK_PRIORITIES, TASK_PRIORITY_LABELS } from "@/constants/priority"
import { PlusIcon } from "lucide-react"

const EMPTY_FORM: TaskFormValues = {
  title: "",
  assignee: "",
  dueDate: "",
  priority: "medium",
}

export function NewTaskSheet() {
  const { user } = useAuth()
  const [open, setOpen] = React.useState(false)
  const [form, setForm] = React.useState<TaskFormValues>(EMPTY_FORM)
  const [isSubmitting, setIsSubmitting] = React.useState(false)

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!user) return
    setIsSubmitting(true)
    try {
      await createTask({
        title: form.title,
        assignee: form.assignee,
        dueDate: form.dueDate,
        priority: form.priority,
        status: "todo",
        createdBy: user.uid,
        createdAt: new Date().toISOString(),
      })
      setForm(EMPTY_FORM)
      setOpen(false)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger render={<Button />}>
        <PlusIcon />
        New task
      </SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>New task</SheetTitle>
        </SheetHeader>
        <form
          id="new-task-form"
          onSubmit={handleSubmit}
          className="flex flex-1 flex-col gap-4 px-4"
        >
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="task-title">Title</FieldLabel>
              <Input
                id="task-title"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                required
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="task-assignee">Assignee</FieldLabel>
              <Input
                id="task-assignee"
                value={form.assignee}
                onChange={(e) => setForm({ ...form, assignee: e.target.value })}
                required
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="task-due-date">Due date</FieldLabel>
              <Input
                id="task-due-date"
                type="date"
                value={form.dueDate}
                onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
                required
              />
            </Field>
            <Field>
              <FieldLabel>Priority</FieldLabel>
              <Select
                value={form.priority}
                onValueChange={(value) =>
                  setForm({ ...form, priority: value as TaskFormValues["priority"] })
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
          </FieldGroup>
        </form>
        <SheetFooter>
          <Button type="submit" form="new-task-form" disabled={isSubmitting}>
            {isSubmitting ? "Creating..." : "Create task"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
