import { HttpError } from "@/lib/server/http"

// Guards the background-job route handlers under /api/jobs/**. Vercel Cron
// invokes them with `Authorization: Bearer <CRON_SECRET>` when the env var is
// set (SPEC §1.5: a background-job / scheduler mechanism). Also lets an operator
// trigger a run by hand with the same header.
export function assertCronRequest(request: Request): void {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    throw new HttpError(500, "CRON_SECRET chưa cấu hình trên server")
  }
  const header = request.headers.get("authorization") ?? ""
  const match = /^Bearer\s+(.+)$/i.exec(header.trim())
  if (!match || match[1].trim() !== secret) {
    throw new HttpError(401, "Job request không hợp lệ")
  }
}
