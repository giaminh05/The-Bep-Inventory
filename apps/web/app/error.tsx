"use client";
import Link from "next/link";
import { Button } from "../components/ui/button";
export default function ErrorPage({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main id="main-content" className="fallback-page">
      <div className="preview-badge">The Bếp · Bản xem trước</div>
      <h1>Chưa mở được trang</h1>
      <p className="muted">
        Đã có lỗi khi tải giao diện. Bạn có thể thử lại hoặc quay về trang đầu.
      </p>
      <div className="fallback-actions">
        <Button onClick={reset}>Thử lại</Button>
        <Link className="button button-secondary" href="/">
          Về trang đầu
        </Link>
      </div>
    </main>
  );
}
