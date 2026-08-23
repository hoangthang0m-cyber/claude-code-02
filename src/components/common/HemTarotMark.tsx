import { cn } from "@/utils/cn"

export function HemTarotMark({ className }: { className?: string }) {
  return (
    <div className={cn("flex flex-col items-center gap-5", className)}>
      <svg viewBox="0 0 200 200" className="h-28 w-28 lg:h-36 lg:w-36">
        <g stroke="white" strokeWidth="2.5" strokeLinecap="round">
          <path d="M100 6 L100 26" />
          <path d="M153 22 L140 38" />
          <path d="M47 22 L60 38" />
          <path d="M182 72 L161 80" />
          <path d="M18 72 L39 80" />
          <path d="M176 132 L156 123" />
          <path d="M24 132 L44 123" />
        </g>
        <circle cx="100" cy="100" r="73" fill="none" stroke="white" strokeWidth="2.5" />
        <circle cx="100" cy="100" r="65" fill="none" stroke="white" strokeWidth="1.25" />
        <circle cx="94" cy="102" r="46" fill="white" />
        <circle cx="116" cy="92" r="43" fill="black" />
        <path d="M110 38 L110 148 L76 116 Z" fill="white" />
      </svg>
      <span className="text-3xl font-black tracking-wide text-white lg:text-4xl">
        Hẻm Tarot
      </span>
    </div>
  )
}
