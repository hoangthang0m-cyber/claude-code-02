import { ProjectList } from "@/modules/project-workspace/components/ProjectList"

export default function ProjectsPage() {
  return (
    <div className="flex flex-col gap-5 px-4 py-5 md:px-6 md:py-6">
      <ProjectList />
    </div>
  )
}
