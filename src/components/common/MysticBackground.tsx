const GRAIN_URL =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.82' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")"

// Trường sao: nhiều chấm sáng rải rác, chỉ hiện ở bản tối.
const STAR_LAYER = [
  "radial-gradient(1.4px 1.4px at 18% 22%, var(--star) 50%, transparent 51%)",
  "radial-gradient(1px 1px at 62% 12%, var(--star) 50%, transparent 51%)",
  "radial-gradient(1.6px 1.6px at 84% 38%, var(--star) 50%, transparent 51%)",
  "radial-gradient(1px 1px at 34% 58%, var(--star) 50%, transparent 51%)",
  "radial-gradient(1.2px 1.2px at 8% 74%, var(--star) 50%, transparent 51%)",
  "radial-gradient(1px 1px at 72% 82%, var(--star) 50%, transparent 51%)",
  "radial-gradient(1.5px 1.5px at 46% 92%, var(--star) 50%, transparent 51%)",
  "radial-gradient(1px 1px at 92% 66%, var(--star) 50%, transparent 51%)",
].join(",")

/**
 * Lớp khí quyển của toàn app — quầng sáng cực quang trôi rất chậm, trường sao
 * lấp lánh (bản tối), hạt nhiễu mịn và vignette. Thuần CSS, không bắt sự kiện
 * chuột, ẩn với trình đọc màn hình; tự đứng yên khi máy bật "giảm chuyển động".
 */
export function MysticBackground() {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
    >
      {/* Quầng cực quang — ba khối màu lớn, nhoè mạnh, trôi lệch pha nhau */}
      <div
        className="absolute -top-[22%] -left-[10%] size-[82vmax] rounded-full opacity-90 blur-[110px]"
        style={{
          background:
            "radial-gradient(circle at 50% 50%, var(--aurora-a), transparent 68%)",
          animation: "aurora-drift 34s ease-in-out infinite",
        }}
      />
      <div
        className="absolute -top-[10%] -right-[12%] size-[70vmax] rounded-full opacity-80 blur-[120px]"
        style={{
          background:
            "radial-gradient(circle at 50% 50%, var(--aurora-c), transparent 66%)",
          animation: "aurora-drift 44s ease-in-out -12s infinite reverse",
        }}
      />
      <div
        className="absolute -bottom-[26%] left-[18%] size-[76vmax] rounded-full opacity-75 blur-[130px]"
        style={{
          background:
            "radial-gradient(circle at 50% 50%, var(--aurora-b), transparent 68%)",
          animation: "aurora-drift 52s ease-in-out -22s infinite",
        }}
      />

      {/* Trường sao — hai lớp, mật độ khác nhau, nhấp nháy lệch nhịp */}
      <div
        className="absolute inset-0 hidden [--star:oklch(0.96_0.02_300)] dark:block"
        style={{
          backgroundImage: STAR_LAYER,
          backgroundSize: "620px 620px",
          animation: "twinkle 7s ease-in-out infinite",
        }}
      />
      <div
        className="absolute inset-0 hidden [--star:oklch(0.88_0.08_84)] dark:block"
        style={{
          backgroundImage: STAR_LAYER,
          backgroundSize: "380px 380px",
          backgroundPosition: "140px 60px",
          animation: "twinkle 11s ease-in-out -4s infinite",
        }}
      />

      {/* Hạt nhiễu mịn — khử dải màu (banding) trên các vùng chuyển sắc lớn */}
      <div
        className="absolute inset-0 opacity-[0.035] mix-blend-overlay dark:opacity-[0.05]"
        style={{ backgroundImage: GRAIN_URL }}
      />

      {/* Vignette — tối bốn góc để nội dung ở giữa nổi lên */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(118% 88% at 50% 34%, transparent 42%, var(--halo) 100%)",
        }}
      />
    </div>
  )
}
