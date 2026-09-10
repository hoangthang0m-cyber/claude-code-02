import {
  COLLECTIONS,
  CONTENT_FORMAT_LABELS,
  CONTENT_STATUS_LABELS,
  ORG_DOCUMENT_CATEGORIES,
  PROJECT_LIFECYCLE_LABELS,
  PROJECT_ROLE_LABELS,
  type ContentFormat,
  type ContentStatus,
  type ProjectLifecycle,
  type ProjectRole,
} from "@/lib/domain"
import type { AuthedUser } from "@/lib/server/auth"
import { getAdminDb } from "@/lib/server/firebaseAdmin"
import { getProgressDashboard } from "@/modules/analytics/services/dashboard.server"
import { listContentItems } from "@/modules/content-pipeline/services/content.server"
import { listOrgDocuments } from "@/modules/document-library/services/orgDocuments.server"

// Bộ công cụ trợ lý AI được phép gọi. Nguyên tắc bất di bất dịch: MỌI công cụ
// đều nhận `actor` và đi qua đúng lớp kiểm quyền mà giao diện đang dùng
// (`listContentItems` gọi `requireProjectScope`, `getProgressDashboard` tự thu
// hẹp theo vai trò...). Nếu bỏ qua bước này, trợ lý trở thành đường vòng vượt
// quyền: nhân viên hỏi là moi được dữ liệu mà màn hình vốn đang chặn.
//
// Toàn bộ đều CHỈ ĐỌC — không công cụ nào ghi, xoá hay đổi trạng thái.

type Json = Record<string, unknown>

export interface AssistantTool {
  name: string
  description: string
  input_schema: {
    type: "object"
    properties: Json
    required?: string[]
  }
  run: (actor: AuthedUser, input: Json) => Promise<unknown>
}

function str(v: unknown): string | undefined {
  const s = typeof v === "string" ? v.trim() : ""
  return s.length > 0 ? s : undefined
}

// ── dự án của tôi ─────────────────────────────────────────────────────────

async function myProjects(actor: AuthedUser) {
  const db = getAdminDb()
  const memberSnap = await db
    .collection(COLLECTIONS.projectMembers)
    .where("user_id", "==", actor.uid)
    .get()

  const rows = memberSnap.docs.map((d) => d.data() as Json)
  const ids = [...new Set(rows.map((r) => String(r.project_id ?? "")))].filter(
    Boolean
  )
  const roleById = new Map(
    rows.map((r) => [String(r.project_id ?? ""), String(r.project_role ?? "staff")])
  )

  const projects = await Promise.all(
    ids.map(async (id) => {
      const snap = await db.collection(COLLECTIONS.projects).doc(id).get()
      if (!snap.exists) return null
      const d = snap.data() as Json
      const lifecycle = String(d.lifecycle ?? "running") as ProjectLifecycle
      const role = (roleById.get(id) ?? "staff") as ProjectRole
      return {
        project_id: id,
        name: String(d.name ?? ""),
        objective: str(d.objective),
        lifecycle,
        lifecycle_label: PROJECT_LIFECYCLE_LABELS[lifecycle] ?? lifecycle,
        my_role: role,
        my_role_label: PROJECT_ROLE_LABELS[role] ?? role,
      }
    })
  )

  return projects.filter((p): p is NonNullable<typeof p> => p !== null)
}

// ── định nghĩa công cụ ────────────────────────────────────────────────────

export const ASSISTANT_TOOLS: AssistantTool[] = [
  {
    name: "list_my_projects",
    description:
      "Liệt kê các dự án mà người đang hỏi là thành viên, kèm mục tiêu, trạng thái vòng đời và vai trò của họ trong dự án. Gọi công cụ này TRƯỚC khi cần project_id cho công cụ khác.",
    input_schema: { type: "object", properties: {} },
    run: async (actor) => {
      const projects = await myProjects(actor)
      return projects.length === 0
        ? { projects: [], note: "Người dùng chưa được thêm vào dự án nào." }
        : { projects }
    },
  },

  {
    name: "list_content_items",
    description:
      "Liệt kê hạng mục nội dung của MỘT dự án. Dùng để trả lời về tiến độ, hạng mục quá hạn, ai đang phụ trách việc gì, chủ đề nào đang làm. Cần project_id lấy từ list_my_projects.",
    input_schema: {
      type: "object",
      properties: {
        project_id: { type: "string", description: "Id dự án" },
        status: {
          type: "string",
          description: `Lọc theo trạng thái, một trong: ${Object.keys(CONTENT_STATUS_LABELS).join(", ")}`,
        },
        topic: { type: "string", description: "Lọc theo chủ đề (khớp một phần)" },
        overdue: { type: "boolean", description: "Chỉ lấy hạng mục quá hạn" },
      },
      required: ["project_id"],
    },
    run: async (actor, input) => {
      const projectId = str(input.project_id)
      if (!projectId) return { error: "Thiếu project_id" }

      const { items } = await listContentItems(actor, projectId, {
        status: str(input.status),
        topic: str(input.topic),
        overdue: input.overdue === true ? true : undefined,
      })

      // Chỉ đưa lên model các trường có ích, tránh đổ nguyên doc vào ngữ cảnh
      // (vừa tốn token vừa lộ trường nội bộ không cần thiết).
      return {
        count: items.length,
        items: items.slice(0, 100).map((i) => {
          const status = String(i.status ?? "") as ContentStatus
          const format = i.content_format as ContentFormat | undefined
          return {
            code: i.code,
            topic: i.topic ?? null,
            status,
            status_label: CONTENT_STATUS_LABELS[status] ?? status,
            format_label: format ? CONTENT_FORMAT_LABELS[format] : null,
            is_overdue: i.is_overdue,
            assignee_id: i.assignee_id ?? null,
            evaluation: i.evaluation ?? null,
          }
        }),
      }
    },
  },

  {
    name: "get_progress_dashboard",
    description:
      "Bảng tổng quan tiến độ nội dung của người đang hỏi: tổng số hạng mục, đang sản xuất, chờ duyệt, quá hạn, đã lên ads, ads đang chạy. Trưởng phòng thấy toàn bộ phạm vi quản lý, nhân viên chỉ thấy phần được giao.",
    input_schema: { type: "object", properties: {} },
    run: async (actor) => getProgressDashboard(actor),
  },

  {
    name: "list_documents",
    description:
      "Liệt kê tài liệu của tổ chức: biên bản họp (meeting_minutes) hoặc tài liệu tổ chức (org_document). Trả về tiêu đề, ngày và đường dẫn.",
    input_schema: {
      type: "object",
      properties: {
        category: {
          type: "string",
          description: `Một trong: ${ORG_DOCUMENT_CATEGORIES.join(", ")}`,
        },
        q: { type: "string", description: "Từ khoá tìm trong tiêu đề" },
      },
      required: ["category"],
    },
    run: async (_actor, input) => {
      const { items } = await listOrgDocuments({
        category: str(input.category),
        q: str(input.q),
      })
      return {
        count: items.length,
        items: items.slice(0, 50).map((d) => ({
          title: d.title,
          doc_date: d.doc_date ?? null,
          url: d.url,
          note: d.note ?? null,
        })),
      }
    },
  },

  {
    name: "search_knowledge",
    description:
      "Tìm trong kho Tri thức của tổ chức (các bài đúc kết kinh nghiệm). Trả về tên, mô tả tổng quan và phần đúc kết. Dùng khi được hỏi về kinh nghiệm, cách làm, bài học đã rút ra.",
    input_schema: {
      type: "object",
      properties: {
        q: { type: "string", description: "Từ khoá tìm trong tên và nội dung" },
      },
    },
    run: async (_actor, input) => {
      const db = getAdminDb()
      const snap = await db
        .collection(COLLECTIONS.knowledgeEntries)
        .where("lifecycle", "==", "active")
        .get()

      const q = (str(input.q) ?? "").toLowerCase()
      const entries = snap.docs
        .map((d) => d.data() as Json)
        .map((d) => ({
          name: String(d.name ?? ""),
          overview: String(d.overview ?? ""),
          conclusion: str(d.conclusion_note) ?? null,
        }))
        .filter((e) =>
          q === ""
            ? true
            : `${e.name} ${e.overview} ${e.conclusion ?? ""}`
                .toLowerCase()
                .includes(q)
        )

      return { count: entries.length, entries: entries.slice(0, 20) }
    },
  },
]

export const ASSISTANT_TOOL_BY_NAME = new Map(
  ASSISTANT_TOOLS.map((t) => [t.name, t])
)
