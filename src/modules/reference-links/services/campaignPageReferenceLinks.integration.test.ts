import { existsSync, readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

// campaign-page-reference-links — group 7.1 / 7.5 static regression checks
// (7.2 createProject→ReferenceLink is in projects.server.test.ts; 7.3 CRUD +
// permissions in referenceLinks.server.test.ts; 7.4 is the existing
// content-pipeline suite staying green).

const SRC = join(process.cwd(), "src")

// A `.ts` / `.tsx` file anywhere under `dir` (recursively). Used instead of a
// bare `existsSync` because Google Drive (this repo syncs through it) keeps
// re-materialising the empty `modules/sheets-sync/{components,services}` folder
// skeletons long after every file in them is deleted — an empty directory is
// not a code-still-present failure.
function hasSourceFiles(dir: string): boolean {
  if (!existsSync(dir)) return false
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, e.name)
    if (e.isDirectory()) {
      if (hasSourceFiles(full)) return true
    } else if (/\.(ts|tsx|js|jsx|mjs)$/.test(e.name)) {
      return true
    }
  }
  return false
}

describe("7.1 Google Sheets sync is fully removed", () => {
  it("no sheets-sync module, no google server lib, no google/sheet routes", () => {
    // files that must be gone outright
    for (const p of [
      "lib/domain/googleConnection.ts",
      "lib/domain/sheetSyncMapping.ts",
      "lib/domain/syncRun.ts",
      "lib/domain/syncConflict.ts",
    ]) {
      expect(existsSync(join(SRC, p)), `${p} should be gone`).toBe(false)
    }
    // directories that must hold no source (an empty skeleton Drive keeps
    // recreating is fine)
    for (const p of [
      "modules/sheets-sync",
      "lib/server/google",
      "app/api/google",
      "app/api/jobs/sheets-sync",
      "app/api/projects/[projectId]/sheet",
    ]) {
      expect(hasSourceFiles(join(SRC, p)), `${p} should have no code`).toBe(
        false
      )
    }
  })

  it("the scheduled-jobs workflow no longer registers sheets-sync", () => {
    const yml = readFileSync(
      join(process.cwd(), ".github/workflows/scheduled-jobs.yml"),
      "utf8"
    )
    expect(yml).not.toContain("sheets-sync")
  })

  it("no source file imports the removed sheets-sync / google modules", () => {
    const bad =
      /@\/modules\/sheets-sync|@\/lib\/server\/google|@\/lib\/domain\/(googleConnection|sheetSyncMapping|syncRun|syncConflict)/
    const offenders: string[] = []
    const walk = (dir: string) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, e.name)
        if (e.isDirectory()) walk(full)
        else if (/\.(ts|tsx)$/.test(e.name) && bad.test(readFileSync(full, "utf8"))) {
          offenders.push(full.replace(SRC, "src"))
        }
      }
    }
    walk(SRC)
    expect(offenders).toEqual([])
  })

  it("COLLECTIONS no longer lists the sync collections but keeps referenceLinks", async () => {
    const { COLLECTIONS } = await import("@/lib/domain")
    for (const k of [
      "sheetSyncMappings",
      "syncRuns",
      "syncConflicts",
      "googleConnections",
    ]) {
      expect(k in COLLECTIONS).toBe(false)
    }
    expect("referenceLinks" in COLLECTIONS).toBe(true)
  })

  it("NOTIFICATION types/groups drop the sync entries", async () => {
    const { NOTIFICATION_TYPES, NOTIFICATION_GROUPS } = await import("@/lib/domain")
    expect((NOTIFICATION_TYPES as readonly string[]).includes("sync_issue")).toBe(
      false
    )
    expect((NOTIFICATION_GROUPS as readonly string[]).includes("sync")).toBe(false)
  })
})

describe("7.5 Meta Ads paths are untouched", () => {
  it("the Meta lib, ad-account routes and ads-overview module still exist", () => {
    for (const p of [
      "lib/server/meta/graph.ts",
      "lib/server/meta/insights.ts",
      "lib/server/meta/reportingInsights.ts",
      "app/api/ad-accounts",
      "modules/ads-overview/services/productReport.server.ts",
      "modules/ads-performance/services/adsBindings.server.ts",
    ]) {
      expect(existsSync(join(SRC, p)), `${p} should still exist`).toBe(true)
    }
  })
})
