"use client"

import * as React from "react"
import Link from "next/link"
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core"
import { restrictToVerticalAxis } from "@dnd-kit/modifiers"
import {
  arrayMove,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"

import { Button } from "@/components/ui/button"
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import { useSidebarNavOrder } from "@/hooks/useSidebarNavOrder"
import { cn } from "@/utils/cn"
import { CirclePlusIcon, GripVerticalIcon, MailIcon } from "lucide-react"

interface NavItem {
  title: string
  url: string
  icon?: React.ReactNode
}

function SortableNavItem({ item }: { item: NavItem }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.url,
  })

  return (
    <SidebarMenuItem
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn("group/nav-item", isDragging && "z-10 opacity-80")}
    >
      <SidebarMenuButton tooltip={item.title} render={<Link href={item.url} />}>
        {item.icon}
        <span>{item.title}</span>
      </SidebarMenuButton>
      <button
        type="button"
        {...attributes}
        {...listeners}
        className="absolute top-1/2 right-1 -translate-y-1/2 cursor-grab touch-none rounded-sm p-0.5 opacity-0 group-hover/nav-item:opacity-100 group-data-[collapsible=icon]:hidden"
      >
        <GripVerticalIcon className="size-3.5 text-muted-foreground" />
        <span className="sr-only">Kéo để sắp xếp</span>
      </button>
    </SidebarMenuItem>
  )
}

export function NavMain({ items }: { items: NavItem[] }) {
  const defaultOrder = React.useMemo(() => items.map((item) => item.url), [items])
  const { order, setOrder } = useSidebarNavOrder(defaultOrder)
  const sensors = useSensors(useSensor(PointerSensor), useSensor(KeyboardSensor))

  const itemByUrl = React.useMemo(() => new Map(items.map((item) => [item.url, item])), [items])
  const orderedItems = order
    .map((url) => itemByUrl.get(url))
    .filter((item): item is NavItem => Boolean(item))

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = order.indexOf(String(active.id))
    const newIndex = order.indexOf(String(over.id))
    setOrder(arrayMove(order, oldIndex, newIndex))
  }

  return (
    <SidebarGroup>
      <SidebarGroupContent className="flex flex-col gap-2">
        <SidebarMenu>
          <SidebarMenuItem className="flex items-center gap-2">
            <SidebarMenuButton
              tooltip="Tạo nhanh"
              className="min-w-8 bg-primary text-primary-foreground duration-200 ease-linear hover:bg-primary/90 hover:text-primary-foreground active:bg-primary/90 active:text-primary-foreground"
            >
              <CirclePlusIcon />
              <span>Tạo nhanh</span>
            </SidebarMenuButton>
            <Button size="icon" className="size-8 group-data-[collapsible=icon]:opacity-0" variant="outline">
              <MailIcon />
              <span className="sr-only">Hộp thư</span>
            </Button>
          </SidebarMenuItem>
        </SidebarMenu>
        <DndContext
          collisionDetection={closestCenter}
          modifiers={[restrictToVerticalAxis]}
          onDragEnd={handleDragEnd}
          sensors={sensors}
        >
          <SortableContext items={order} strategy={verticalListSortingStrategy}>
            <SidebarMenu>
              {orderedItems.map((item) => (
                <SortableNavItem key={item.url} item={item} />
              ))}
            </SidebarMenu>
          </SortableContext>
        </DndContext>
      </SidebarGroupContent>
    </SidebarGroup>
  )
}
