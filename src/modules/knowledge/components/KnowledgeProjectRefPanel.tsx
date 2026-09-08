"use client"

import * as React from "react"
import { PlusIcon } from "lucide-react"
import { toast } from "sonner"

import type {
  KnowledgeProjectRefType,
  KnowledgeProjectRefView,
} from "@/lib/domain"
import { useMyProjects } from "@/modules/project-workspace/hooks/useMyProjects"
import { useProjectGroups } from "@/modules/project-grouping/hooks/useProjectGroups"
import {
  addKnowledgeProjectRef,
  deleteKnowledgeProjectRef,
} from "@/modules/knowledge/services/knowledge.client"
import { KnowledgeProjectRefChip } from "@/modules/knowledge/components/KnowledgeProjectRefChip"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

// The "Quá trình đúc kết" reference area: cards linking to a Project / Group,
// plus a picker sourced from useMyProjects() + useProjectGroups() (design.md
// Decision 3). The name on a card is the snapshot taken at attach time — it does
// NOT re-sync when the project is renamed.
export function KnowledgeProjectRefPanel({
  entryId,
  refs,
  editable,
}: {
  entryId: string
  refs: KnowledgeProjectRefView[]
  editable: boolean
}) {
  const { projects: myProjects } = useMyProjects()
  const projects = myProjects ?? []
  const { groups } = useProjectGroups()
  const [busy, setBusy] = React.useState(false)
  const [adding, setAdding] = React.useState(false)

  const attached = new Set(refs.map((r) => `${r.ref_type}:${r.ref_id}`))

  async function run(p: Promise<unknown>, ok: string) {
    setBusy(true)
    try {
      await p
      toast.success(ok)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Thất bại")
    } finally {
      setBusy(false)
    }
  }

  function attach(value: string) {
    // value shape: "project:<id>" | "project_group:<id>"
    const idx = value.indexOf(":")
    const ref_type = value.slice(0, idx) as KnowledgeProjectRefType
    const ref_id = value.slice(idx + 1)
    if (!ref_id) return
    run(
      addKnowledgeProjectRef(entryId, { ref_type, ref_id }),
      "Đã gắn tham chiếu"
    )
    setAdding(false)
  }

  return (
    <div className="flex flex-col gap-2">
      {refs.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Chưa gắn Dự án / Nhóm dự án nào.
        </p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {refs.map((ref) => (
            <li key={ref.id}>
              <KnowledgeProjectRefChip
                refItem={ref}
                editable={editable}
                busy={busy}
                onRemove={() =>
                  run(deleteKnowledgeProjectRef(ref.id), "Đã gỡ tham chiếu")
                }
              />
            </li>
          ))}
        </ul>
      )}

      {editable &&
        (adding ? (
          <Select value="" onValueChange={(v) => v && attach(v)}>
            <SelectTrigger size="sm" className="w-72">
              <SelectValue placeholder="Chọn Dự án hoặc Nhóm dự án…" />
            </SelectTrigger>
            <SelectContent>
              {groups.length > 0 && (
                <SelectGroup>
                  <SelectLabel>Nhóm dự án</SelectLabel>
                  {groups.map((g) => (
                    <SelectItem
                      key={g.id}
                      value={`project_group:${g.id}`}
                      disabled={attached.has(`project_group:${g.id}`)}
                    >
                      {g.name}
                    </SelectItem>
                  ))}
                </SelectGroup>
              )}
              {projects.length > 0 && (
                <SelectGroup>
                  <SelectLabel>Dự án</SelectLabel>
                  {projects.map((p) => (
                    <SelectItem
                      key={p.id}
                      value={`project:${p.id}`}
                      disabled={attached.has(`project:${p.id}`)}
                    >
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectGroup>
              )}
              {groups.length === 0 && projects.length === 0 && (
                <SelectItem value="__none__" disabled>
                  Chưa có Dự án / Nhóm dự án nào
                </SelectItem>
              )}
            </SelectContent>
          </Select>
        ) : (
          <Button
            size="xs"
            variant="outline"
            className="self-start"
            onClick={() => setAdding(true)}
          >
            <PlusIcon /> Gắn Dự án / Nhóm
          </Button>
        ))}
    </div>
  )
}
