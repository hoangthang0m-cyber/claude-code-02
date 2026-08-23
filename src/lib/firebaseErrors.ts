export function getAuthErrorMessage(err: unknown): string {
  const code = (err as { code?: string })?.code ?? "unknown"
  const messages: Record<string, string> = {
    "auth/invalid-credential": "Email hoặc mật khẩu không đúng.",
    "auth/user-not-found": "Tài khoản không tồn tại.",
    "auth/wrong-password": "Sai mật khẩu.",
    "auth/unauthorized-domain":
      "Domain này chưa được cho phép trong Firebase (Authentication > Settings > Authorized domains).",
    "auth/invalid-api-key": "API key Firebase không đúng hoặc chưa được cấu hình.",
    "auth/api-key-not-valid.-please-pass-a-valid-api-key.":
      "API key Firebase không đúng hoặc chưa được cấu hình.",
    "auth/popup-blocked": "Trình duyệt đã chặn popup đăng nhập Google.",
    "auth/popup-closed-by-user": "Bạn đã đóng popup đăng nhập trước khi hoàn tất.",
    "auth/network-request-failed": "Lỗi kết nối mạng.",
  }
  if (messages[code]) return messages[code]
  const message = (err as { message?: string })?.message
  return message ? `Đăng nhập thất bại: ${message}` : `Đăng nhập thất bại (${code}).`
}
