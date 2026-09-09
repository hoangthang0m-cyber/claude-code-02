import { DocumentLibraryView } from "@/modules/document-library/components/DocumentLibraryView"

// document-library — the "Tài liệu" screen: two libraries of external links
// (biên bản họp + tài liệu tổ chức). Any signed-in member can add / edit /
// delete; links only open in a new tab.
export default function DocumentsPage() {
  return (
    <div className="flex flex-col gap-5 px-4 py-5 md:px-6 md:py-6">
      <DocumentLibraryView />
    </div>
  )
}
