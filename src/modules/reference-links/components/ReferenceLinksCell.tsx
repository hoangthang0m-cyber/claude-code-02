"use client"

import * as React from "react"
import { PaperclipIcon } from "lucide-react"

import { ReferenceLinksPanel } from "@/modules/reference-links/components/ReferenceLinksPanel"
import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"

// task 4.4: the "Tài liệu" column cell — a count + a sheet with the item's full
// reference-links panel (which is also task 4.3).
export function ReferenceLinksCell({
  contentItemId,
  code,
  count,
}: {
  contentItemId: string
  code: string
  count: number
}) {
  const [open, setOpen] = React.useState(false)

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={
          <Button size="xs" variant="ghost" className="gap-1 tabular-nums">
            <PaperclipIcon />
            {count > 0 ? count : "—"}
          </Button>
        }
      />
      <SheetContent className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Tài liệu tham khảo — {code}</SheetTitle>
        </SheetHeader>
        <div className="overflow-y-auto px-4 pb-4">
          {open && (
            <ReferenceLinksPanel
              ownerType="content_item"
              ownerId={contentItemId}
              compact
            />
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
