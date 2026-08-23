"use client"

import * as React from "react"

import { NewTaskSheet } from "@/modules/tasks/components/NewTaskSheet"
import { TaskCalendarView } from "@/modules/tasks/components/TaskCalendarView"
import { TaskDetailDrawer } from "@/modules/tasks/components/TaskDetailDrawer"
import { TaskFilterBar } from "@/modules/tasks/components/TaskFilterBar"
import { TaskKanbanBoard } from "@/modules/tasks/components/TaskKanbanBoard"
import { TaskList } from "@/modules/tasks/components/TaskList"
import { useTaskFilters } from "@/modules/tasks/hooks/useTaskFilters"
import { useTasks } from "@/modules/tasks/hooks/useTasks"
import { updateTask } from "@/modules/tasks/services/tasks.service"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

export function TasksView() {
  const { tasks, loading } = useTasks()
  const { filters, setFilters, filtered, assigneeOptions } = useTaskFilters(tasks)
  const [view, setView] = React.useState("list")
  const [selectedTaskId, setSelectedTaskId] = React.useState<string | null>(null)

  return (
    <div className="flex flex-col gap-4 px-4 py-4 md:px-6 md:py-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {loading ? "Đang tải..." : `${filtered.length} / ${tasks.length} công việc`}
        </p>
        <NewTaskSheet />
      </div>

      <TaskFilterBar
        filters={filters}
        onChange={setFilters}
        assigneeOptions={assigneeOptions}
      />

      <Tabs value={view} onValueChange={setView}>
        <TabsList>
          <TabsTrigger value="list">List</TabsTrigger>
          <TabsTrigger value="kanban">Kanban</TabsTrigger>
          <TabsTrigger value="calendar">Calendar</TabsTrigger>
        </TabsList>
        <TabsContent value="list">
          <TaskList tasks={filtered} onSelectTask={setSelectedTaskId} />
        </TabsContent>
        <TabsContent value="kanban">
          <TaskKanbanBoard
            tasks={filtered}
            onSelectTask={setSelectedTaskId}
            onStatusChange={(taskId, status) => updateTask(taskId, { status })}
          />
        </TabsContent>
        <TabsContent value="calendar">
          <TaskCalendarView tasks={filtered} onSelectTask={setSelectedTaskId} />
        </TabsContent>
      </Tabs>

      <TaskDetailDrawer
        taskId={selectedTaskId}
        open={selectedTaskId !== null}
        onOpenChange={(open) => !open && setSelectedTaskId(null)}
      />
    </div>
  )
}
