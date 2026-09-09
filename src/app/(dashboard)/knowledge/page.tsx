import { KnowledgeList } from "@/modules/knowledge/components/KnowledgeList"

// knowledge-base — the "Tri thức" screen: the org knowledge base list.
export default function KnowledgePage() {
  return (
    <div className="flex flex-col gap-5 px-4 py-5 md:px-6 md:py-6">
      <KnowledgeList />
    </div>
  )
}
