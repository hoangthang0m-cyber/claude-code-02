"use client"

import Link from "next/link"
import { FolderKanbanIcon, FolderTreeIcon, XIcon } from "lucide-react"

import {
  KNOWLEDGE_PROJECT_REF_TYPE_LABELS,
  knowledgeRefHref,
  type KnowledgeProjectRefView,
} from "@/lib/domain"
import { Button } from "@/components/ui/button"

// One reference card: the snapshot name (links to the Project / Group page) +
// its type, with a remove button when editable.
export function KnowledgeProjectRefChip({
  refItem,
  editable,
  busy,
  onRemove,
}: {
  refItem: KnowledgeProjectRefView
  editable: boolean
  busy: boolean
  onRemove: () => void
}) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-lg border bg-muted/40 py-1 pr-1 pl-2 text-sm">
      {refItem.ref_type === "project_group" ? (
        <FolderTreeIcon className="size-3.5 text-muted-foreground" />
      ) : (
        <FolderKanbanIcon className="size-3.5 text-muted-foreground" />
      )}
      <Link href={knowledgeRefHref(refItem)} className="hover:underline">
        {refItem.ref_name}
      </Link>
      <span className="text-xs text-muted-foreground">
        {KNOWLEDGE_PROJECT_REF_TYPE_LABELS[refItem.ref_type]}
      </span>
      {editable && (
        <Button
          size="icon-xs"
          variant="ghost"
          className="text-muted-foreground hover:text-destructive"
          disabled={busy}
          aria-label="Gỡ tham chiếu"
          onClick={onRemove}
        >
          <XIcon />
        </Button>
      )}
    </span>
  )
}
