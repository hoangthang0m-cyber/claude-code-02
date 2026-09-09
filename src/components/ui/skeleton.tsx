import { cn } from "@/utils/cn"

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn(
        // vệt sáng quét ngang thay cho nhấp nháy — dịu mắt và hợp tông hơn
        "rounded-lg bg-muted/70 bg-[linear-gradient(100deg,transparent_28%,color-mix(in_oklch,var(--foreground),transparent_92%)_46%,transparent_64%)] bg-[length:280%_100%]",
        className
      )}
      style={{ animation: "shimmer-slide 1.9s ease-in-out infinite" }}
      {...props}
    />
  )
}

export { Skeleton }
