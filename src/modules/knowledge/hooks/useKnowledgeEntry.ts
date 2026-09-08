"use client"

import * as React from "react"
import { collection, doc, onSnapshot, query, where } from "firebase/firestore"

import { useAuth } from "@/context/AuthContext"
import { db } from "@/firebase/config"
import {
  COLLECTIONS,
  KNOWLEDGE_LINK_SECTIONS,
  type KnowledgeEntry,
  type KnowledgeLinkSection,
  type KnowledgeLinkView,
  type KnowledgeProjectRefView,
} from "@/lib/domain"

type LinksBySection = Record<KnowledgeLinkSection, KnowledgeLinkView[]>

const emptyBySection = (): LinksBySection => ({
  detail: [],
  process: [],
  conclusion: [],
})

// One knowledge entry with its section links and project references, all live
// (design.md Decision 5: reads via onSnapshot, never the API). `notFound` when
// the entry document does not exist.
export function useKnowledgeEntry(entryId: string) {
  const { user } = useAuth()
  const [entry, setEntry] = React.useState<KnowledgeEntry | null>(null)
  const [notFound, setNotFound] = React.useState(false)
  const [links, setLinks] = React.useState<LinksBySection>(emptyBySection)
  const [refs, setRefs] = React.useState<KnowledgeProjectRefView[]>([])

  React.useEffect(() => {
    if (!user || !entryId) return

    const unsubEntry = onSnapshot(
      doc(db, COLLECTIONS.knowledgeEntries, entryId),
      (snap) => {
        if (snap.exists()) {
          setEntry({
            id: snap.id,
            ...(snap.data() as Omit<KnowledgeEntry, "id">),
          })
          setNotFound(false)
        } else {
          setEntry(null)
          setNotFound(true)
        }
      },
      () => setNotFound(true)
    )

    const unsubLinks = onSnapshot(
      query(
        collection(db, COLLECTIONS.knowledgeLinks),
        where("entry_id", "==", entryId)
      ),
      (snap) => {
        const grouped = emptyBySection()
        snap.docs.forEach((d) => {
          const data = d.data()
          const section = data.section as KnowledgeLinkSection
          if (!KNOWLEDGE_LINK_SECTIONS.includes(section)) return
          grouped[section].push({
            id: d.id,
            entry_id: entryId,
            section,
            url: String(data.url ?? ""),
            label: String(data.label ?? ""),
            note: typeof data.note === "string" ? data.note : null,
            sort_index: Number(data.sort_index ?? 0),
          })
        })
        for (const s of KNOWLEDGE_LINK_SECTIONS) {
          grouped[s].sort((a, b) => a.sort_index - b.sort_index)
        }
        setLinks(grouped)
      },
      () => setLinks(emptyBySection())
    )

    const unsubRefs = onSnapshot(
      query(
        collection(db, COLLECTIONS.knowledgeProjectRefs),
        where("entry_id", "==", entryId)
      ),
      (snap) => {
        setRefs(
          snap.docs
            .map((d) => {
              const data = d.data()
              return {
                id: d.id,
                entry_id: entryId,
                ref_type:
                  data.ref_type === "project_group"
                    ? ("project_group" as const)
                    : ("project" as const),
                ref_id: String(data.ref_id ?? ""),
                ref_name: String(data.ref_name ?? data.ref_id ?? ""),
                note: typeof data.note === "string" ? data.note : null,
                sort_index: Number(data.sort_index ?? 0),
              }
            })
            .sort((a, b) => a.sort_index - b.sort_index)
        )
      },
      () => setRefs([])
    )

    return () => {
      unsubEntry()
      unsubLinks()
      unsubRefs()
    }
  }, [user, entryId])

  return {
    entry,
    notFound,
    links,
    refs,
    loading: entry === null && !notFound,
  }
}
