import { KnowledgeEntryView } from "@/modules/knowledge/components/KnowledgeEntryView"

export default async function KnowledgeEntryPage({
  params,
}: {
  params: Promise<{ entryId: string }>
}) {
  const { entryId } = await params
  return (
    <div className="flex flex-col gap-5 px-4 py-5 md:px-6 md:py-6">
      <KnowledgeEntryView entryId={entryId} />
    </div>
  )
}
