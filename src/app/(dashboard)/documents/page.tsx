import { DocumentLibraryView } from "@/modules/document-library/components/DocumentLibraryView"

// document-library — the "Tài liệu" screen: two libraries of external links
// (biên bản họp + tài liệu tổ chức). Any signed-in member can add / edit /
// delete; links only open in a new tab.
export default function DocumentsPage() {
  return (
    <div className="animate-in fade-in slide-in-from-bottom-2 flex flex-col gap-4 px-4 py-4 duration-300 md:px-6 md:py-6">
      <DocumentLibraryView />
    </div>
  )
}
