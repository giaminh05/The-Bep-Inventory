import Link from "next/link";
import { Brand } from "./brand";
import { Icon } from "./icon";
import { Card } from "./ui/card";
import { ConnectionCard } from "./connection-card";

const managerNavigation = [
  { id: "overview", text: "Tổng quan", icon: "grid" },
  { id: "locations", text: "Địa điểm", icon: "store" },
  { id: "scope", text: "Phạm vi bản xem trước", icon: "shield" },
] as const;
const staffNavigation = [
  { id: "overview", text: "Tổng quan", icon: "grid" },
  { id: "locations", text: "Địa điểm", icon: "store" },
  { id: "scope", text: "Thông tin", icon: "list" },
] as const;

export function PreviewShell({ role }: { role: "manager" | "staff" }) {
  const manager = role === "manager";
  const navigation = manager ? managerNavigation : staffNavigation;
  const title = manager ? "Không gian quản lý" : "Không gian nhân viên";
  const nav = (
    <nav
      aria-label={
        manager
          ? "Điều hướng quản lý xem trước"
          : "Điều hướng nhân viên xem trước"
      }
    >
      {navigation.map((item) => (
        <a href={`#${item.id}`} key={item.id}>
          <Icon name={item.icon} />
          <span>{item.text}</span>
        </a>
      ))}
    </nav>
  );

  return (
    <div
      className={`workspace ${manager ? "manager-workspace" : "staff-workspace"}`}
    >
      <aside className="sidebar">
        <Brand />
        <span className="preview-badge">Bản xem trước</span>
        {nav}
        <div className="sidebar-foot">
          <p className="small muted">
            Giao diện mới đang được chuẩn bị theo từng bước.
          </p>
          <Link className="text-link" href="/">
            Về trang đầu <span aria-hidden="true">↗</span>
          </Link>
        </div>
      </aside>
      <div className="workspace-body">
        <header className="workspace-header">
          <span className="small muted">
            The Bếp <span aria-hidden="true">/</span>{" "}
            {manager ? "Quản lý" : "Nhân viên"}
          </span>
          <span className="preview-badge">Chỉ xem giao diện</span>
        </header>
        {manager ? (
          <details className="mobile-menu">
            <summary>
              Chức năng <span aria-hidden="true">⌄</span>
            </summary>
            {nav}
            <Link href="/">Về trang đầu</Link>
          </details>
        ) : null}
        <main id="main-content" className="workspace-main">
          <section id="overview" className="page-intro">
            <p className="eyebrow">SẴN SÀNG CHO MỘT NGÀY MỚI</p>
            <h1>{title}</h1>
            <p className="muted">
              {manager
                ? "Một góc nhìn rõ ràng cho mọi địa điểm của The Bếp."
                : "Một không gian gọn gàng để bắt đầu công việc tại cửa hàng."}
            </p>
          </section>
          <div className="preview-notice">
            <Icon name="shield" />
            <p>
              Đây là bản xem trước bố cục. Liên kết vai trò không cấp quyền truy
              cập; quyền vẫn do máy chủ xác thực.
            </p>
          </div>
          <div className="workspace-grid">
            <Card className="empty-card">
              <span className="empty-icon">
                <Icon name="box" size={32} />
              </span>
              <p className="eyebrow">KHÔNG GIAN LÀM VIỆC</p>
              <h2>Dữ liệu sẽ xuất hiện tại đây</h2>
              <p className="muted">
                Khi các luồng đăng nhập và dữ liệu được chuyển sang giao diện
                mới, bạn sẽ theo dõi công việc tại đây. Bản xem trước chưa tải
                số lượng tồn kho.
              </p>
              <span className="quiet-badge">
                <Icon name="clock" size={15} /> Đang xây dựng nền tảng
              </span>
            </Card>
            <ConnectionCard />
          </div>
          <Card id="locations" className="locations-card">
            <div>
              <p className="eyebrow">CÙNG MỘT HỆ THỐNG</p>
              <h2>Năm địa điểm, một The Bếp</h2>
              <p className="small muted">
                Danh sách địa điểm của hệ thống; không thể chọn hoặc truy cập
                kho trong bản xem trước.
              </p>
            </div>
            <ul className="location-list">
              {[
                "Duluth",
                "Johns Creek",
                "Norcross",
                "Kho DL House",
                "Kho Extra",
              ].map((location) => (
                <li key={location}>
                  <Icon name="store" size={17} />
                  {location}
                </li>
              ))}
            </ul>
          </Card>
          <section id="scope" className="scope-note">
            <Icon name="shield" />
            <div>
              <h2>Phạm vi bản xem trước</h2>
              <p className="muted small">
                Chưa có đăng nhập, kiểm kê, nhập hàng, chuyển kho hoặc khôi phục
                bản nháp. Các nghiệp vụ tiếp tục thực hiện trên ứng dụng hiện
                tại.
              </p>
            </div>
          </section>
          <footer className="workspace-footer">
            <span>The Bếp Teahouse</span>
            <Link href={manager ? "/preview/staff" : "/preview/manager"}>
              Xem bố cục {manager ? "nhân viên" : "quản lý"}{" "}
              <span aria-hidden="true">→</span>
            </Link>
          </footer>
        </main>
      </div>
      {!manager ? <div className="staff-bottom-nav">{nav}</div> : null}
    </div>
  );
}
