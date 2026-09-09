import { ProjectWorkspace } from "@/modules/project-workspace/components/ProjectWorkspace"

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ projectId: string }>
}) {
  const { projectId } = await params
  return (
    <div className="flex flex-col gap-5 px-4 py-5 md:px-6 md:py-6">
      <ProjectWorkspace projectId={projectId} />
    </div>
  )
}
