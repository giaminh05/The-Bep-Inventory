export default function Loading() {
  return (
    <main id="main-content" className="fallback-page" aria-busy="true">
      <div className="preview-badge">The Bếp</div>
      <h1>Đang mở không gian…</h1>
      <p className="muted" role="status">
        Vui lòng chờ trong giây lát.
      </p>
    </main>
  );
}
