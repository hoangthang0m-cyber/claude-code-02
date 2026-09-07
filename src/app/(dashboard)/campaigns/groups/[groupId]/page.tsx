import { GroupRollupView } from "@/modules/project-grouping/components/GroupRollupView"

export default async function GroupRollupPage({
  params,
}: {
  params: Promise<{ groupId: string }>
}) {
  const { groupId } = await params
  return (
    <div className="animate-in fade-in slide-in-from-bottom-2 flex flex-col gap-4 px-4 py-4 duration-300 md:px-6 md:py-6">
      <GroupRollupView groupId={groupId} />
    </div>
  )
}
