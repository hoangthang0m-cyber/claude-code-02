import { beforeEach, describe, expect, it, vi } from "vitest"

// Consolidated permission matrix for SPEC §7.2 task 2.5: every project-workspace
// mutation is gated to a project manager (createProject to a system manager).
// Viewing is not covered here — it is member-scoped in firestore.rules, not
// manager-only ("trừ xem").

const { fx } = vi.hoisted(() => ({
  fx: { projectRole: "manager" as "manager" | "staff" | null },
}))

vi.mock("@/lib/server/firebaseAdmin", () => {
  const query = (collection: string, clauses: string[]) => ({
    where: (f: string) => query(collection, [...clauses, f]),
    limit: () => query(collection, clauses),
    get: async () => {
      if (collection === "projectMembers" && clauses.includes("project_role")) {
        return { empty: false, docs: [{ id: "m1" }, { id: "m2" }] }
      }
      if (collection === "projectMembers" && clauses.includes("user_id")) {
        return fx.projectRole == null
          ? { empty: true, docs: [] }
          : {
              empty: false,
              docs: [{ data: () => ({ project_role: fx.projectRole }) }],
            }
      }
      return { empty: true, docs: [], forEach: () => {} }
    },
  })
  const doc = (collection: string, id?: string) => ({
    id: id ?? `${collection}-x`,
    get: async () => {
      if (collection === "projects") {
        return { exists: true, data: () => ({ lifecycle: "running" }) }
      }
      if (collection === "projectMembers") {
        return id?.includes("__")
          ? { exists: false }
          : {
              exists: true,
              data: () => ({
                project_id: "p1",
                user_id: "u-target",
                project_role: "staff",
              }),
            }
      }
      return { exists: false, data: () => undefined }
    },
    set: async () => {},
    update: async () => {},
    delete: async () => {},
  })
  return {
    getAdminAuth: () => ({ getUser: async (uid: string) => ({ uid }) }),
    getAdminDb: () => ({
      collection: (name: string) => ({
        ...query(name, []),
        doc: (id?: string) => doc(name, id),
      }),
      batch: () => ({
        set: () => {},
        update: () => {},
        delete: () => {},
        commit: async () => {},
      }),
    }),
  }
})

import type { AuthedUser } from "@/lib/server/auth"
import {
  addProjectMember,
  removeProjectMember,
  updateProjectMember,
} from "@/modules/project-workspace/services/members.server"
import {
  changeProjectLifecycle,
  createProject,
  updateProject,
} from "@/modules/project-workspace/services/projects.server"

const actor: AuthedUser = { uid: "u-actor", email: null, system_role: "manager" }

beforeEach(() => {
  fx.projectRole = "manager"
})

async function status(promise: Promise<unknown>): Promise<number | "ok"> {
  try {
    await promise
    return "ok"
  } catch (e) {
    return (e as { status?: number }).status ?? -1
  }
}

const projectScopedMutations = {
  updateProject: () => updateProject(actor, "p1", { name: "x" }),
  changeProjectLifecycle: () =>
    changeProjectLifecycle(actor, "p1", { lifecycle: "done" }),
  addProjectMember: () =>
    addProjectMember(actor, "p1", { user_id: "u-new", project_role: "staff" }),
  updateProjectMember: () =>
    updateProjectMember(actor, "p1", "m1", { skill_tag: "ads" }),
  removeProjectMember: () => removeProjectMember(actor, "p1", "m1"),
}

describe("§7.2 permission matrix — project-scoped mutations", () => {
  for (const [name, run] of Object.entries(projectScopedMutations)) {
    describe(name, () => {
      it("rejects a non-member with 403", async () => {
        fx.projectRole = null
        expect(await status(run())).toBe(403)
      })

      it("rejects a staff member with 403", async () => {
        fx.projectRole = "staff"
        expect(await status(run())).toBe(403)
      })

      it("lets a manager past the permission gate (no 403)", async () => {
        fx.projectRole = "manager"
        expect(await status(run())).not.toBe(403)
      })
    })
  }
})

describe("§7.2 permission matrix — createProject (system role)", () => {
  it("rejects a system-role staff account with 403", async () => {
    expect(
      await status(
        createProject(
          { ...actor, system_role: "staff" },
          { name: "x", objective: "y" }
        )
      )
    ).toBe(403)
  })

  it("lets a system-role manager past the gate (no 403)", async () => {
    expect(
      await status(
        createProject(
          { ...actor, system_role: "manager" },
          { name: "x", objective: "y" }
        )
      )
    ).not.toBe(403)
  })
})
