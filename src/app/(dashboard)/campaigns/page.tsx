import { ProjectList } from "@/modules/project-workspace/components/ProjectList"

export default function ProjectsPage() {
  return (
    <div className="animate-in fade-in slide-in-from-bottom-2 flex flex-col gap-4 px-4 py-4 duration-300 md:px-6 md:py-6">
      <ProjectList />
    </div>
  )
}
