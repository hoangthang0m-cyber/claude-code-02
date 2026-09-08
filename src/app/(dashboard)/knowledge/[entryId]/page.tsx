import { KnowledgeEntryView } from "@/modules/knowledge/components/KnowledgeEntryView"

export default async function KnowledgeEntryPage({
  params,
}: {
  params: Promise<{ entryId: string }>
}) {
  const { entryId } = await params
  return (
    <div className="animate-in fade-in slide-in-from-bottom-2 flex flex-col gap-4 px-4 py-4 duration-300 md:px-6 md:py-6">
      <KnowledgeEntryView entryId={entryId} />
    </div>
  )
}
