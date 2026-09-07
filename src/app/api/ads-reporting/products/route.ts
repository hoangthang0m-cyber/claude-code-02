import { getAuthedUser } from "@/lib/server/auth"
import { errorResponse } from "@/lib/server/http"
import { readJsonBody } from "@/lib/server/validate"
import { createProduct } from "@/modules/ads-overview/services/productConfig.server"

export const dynamic = "force-dynamic"

// POST /api/ads-reporting/products — add a product (task 2.5). Body:
// { code, name, keywords? }. Manager only.
export async function POST(request: Request) {
  try {
    const actor = await getAuthedUser(request)
    const result = await createProduct(actor, await readJsonBody(request))
    return Response.json(result, { status: 201 })
  } catch (error) {
    return errorResponse(error)
  }
}
