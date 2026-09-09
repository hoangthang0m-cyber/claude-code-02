import { KnowledgeList } from "@/modules/knowledge/components/KnowledgeList"

// knowledge-base — the "Tri thức" screen: the org knowledge base list.
export default function KnowledgePage() {
  return (
    <div className="animate-in fade-in slide-in-from-bottom-2 flex flex-col gap-4 px-4 py-4 duration-300 md:px-6 md:py-6">
      <KnowledgeList />
    </div>
  )
}
