import { getAuthedUser } from "@/lib/server/auth"
import { errorResponse } from "@/lib/server/http"
import { readJsonBody } from "@/lib/server/validate"
import {
  deleteProduct,
  updateProduct,
} from "@/modules/ads-overview/services/productConfig.server"

export const dynamic = "force-dynamic"

type Ctx = { params: Promise<{ productId: string }> }

// PATCH /api/ads-reporting/products/[productId] — edit name / keywords (task
// 2.5). The code is the doc id and cannot change. Manager only.
export async function PATCH(request: Request, { params }: Ctx) {
  try {
    const { productId } = await params
    const actor = await getAuthedUser(request)
    const result = await updateProduct(
      actor,
      productId,
      await readJsonBody(request)
    )
    return Response.json(result)
  } catch (error) {
    return errorResponse(error)
  }
}

// DELETE /api/ads-reporting/products/[productId] — blocked while a rule or
// override still references it (task 2.5). Manager only.
export async function DELETE(request: Request, { params }: Ctx) {
  try {
    const { productId } = await params
    const actor = await getAuthedUser(request)
    return Response.json(await deleteProduct(actor, productId))
  } catch (error) {
    return errorResponse(error)
  }
}
