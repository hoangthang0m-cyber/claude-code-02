export const MAX_PRODUCT_FILE_BYTES = 20 * 1024 * 1024
export const MAX_VIDEO_FILE_BYTES = 200 * 1024 * 1024

export const PRODUCT_FILE_MIME_TYPES: Record<string, string> = {
  "application/msword": ".doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
  "application/vnd.ms-excel": ".xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx",
  "application/pdf": ".pdf",
}

export const PRODUCT_FILE_ACCEPT = Object.values(PRODUCT_FILE_MIME_TYPES).join(",")

export const VIDEO_MIME_TYPES: Record<string, string> = {
  "video/mp4": ".mp4",
  "video/quicktime": ".mov",
  "video/webm": ".webm",
}

export const VIDEO_ACCEPT = Object.values(VIDEO_MIME_TYPES).join(",")
