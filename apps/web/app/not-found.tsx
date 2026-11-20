import Link from "next/link";
export default function NotFound() {
  return (
    <main id="main-content" className="fallback-page">
      <p className="eyebrow">THE BẾP · 404</p>
      <h1>Chưa có trang này</h1>
      <p className="muted">Đường dẫn này chưa có trong bản xem trước.</p>
      <Link className="button" href="/">
        Về trang đầu <span aria-hidden="true">→</span>
      </Link>
    </main>
  );
}
