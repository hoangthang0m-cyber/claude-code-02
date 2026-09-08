"use client"

import * as React from "react"
import { toast } from "sonner"

// After a move / resize / quick-create / delete, show a toast with a 10-second
// "Hoàn tác" action that runs the inverse operation (Mục D task 7.6).
export function useCalendarUndo() {
  return React.useCallback(
    (message: string, undo: () => void | Promise<unknown>) => {
      toast(message, {
        duration: 10_000,
        action: {
          label: "Hoàn tác",
          onClick: () => {
            Promise.resolve(undo()).catch(() =>
              toast.error("Không hoàn tác được")
            )
          },
        },
      })
    },
    []
  )
}
