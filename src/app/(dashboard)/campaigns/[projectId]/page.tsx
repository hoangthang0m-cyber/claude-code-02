import { ProjectWorkspace } from "@/modules/project-workspace/components/ProjectWorkspace"

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ projectId: string }>
}) {
  const { projectId } = await params
  return (
    <div className="animate-in fade-in slide-in-from-bottom-2 flex flex-col gap-4 px-4 py-4 duration-300 md:px-6 md:py-6">
      <ProjectWorkspace projectId={projectId} />
    </div>
  )
}
