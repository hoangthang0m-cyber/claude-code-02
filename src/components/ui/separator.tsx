"use client"

import { Separator as SeparatorPrimitive } from "@base-ui/react/separator"

import { cn } from "@/utils/cn"

function Separator({
  className,
  orientation = "horizontal",
  ...props
}: SeparatorPrimitive.Props) {
  return (
    <SeparatorPrimitive
      data-slot="separator"
      orientation={orientation}
      className={cn(
        // đường kẻ nhạt dần về hai đầu — mềm hơn một vạch cắt ngang cứng
        "shrink-0 border-0 bg-border data-horizontal:h-px data-horizontal:w-full data-horizontal:bg-[linear-gradient(90deg,transparent,var(--border)_12%,var(--border)_88%,transparent)] data-vertical:w-px data-vertical:self-stretch data-vertical:bg-[linear-gradient(180deg,transparent,var(--border)_12%,var(--border)_88%,transparent)]",
        className
      )}
      {...props}
    />
  )
}

export { Separator }
