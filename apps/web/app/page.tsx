import Link from "next/link";
import { Brand } from "../components/brand";
import { ConnectionCard } from "../components/connection-card";
import { Icon } from "../components/icon";
import { Card } from "../components/ui/card";

export default function HomePage() {
  return (
    <div className="landing">
      <header className="landing-header">
        <Brand />
        <span className="preview-badge">Giao diện mới · Bản xem trước</span>
      </header>
      <main id="main-content">
        <section className="hero">
          <div className="hero-copy">
            <p className="eyebrow">
              <span className="tiny-line" /> KHÔNG GIAN LÀM VIỆC THE BẾP
            </p>
            <h1>
              Gọn gàng hơn.
              <br />
              <span>Để mỗi ngày</span>
              <br />
              thật nhẹ nhàng.
            </h1>
            <p className="hero-description">
              Một không gian mới cho công việc quản lý kho.
              <br className="desktop-break" /> Rõ ràng, gần gũi và sẵn sàng lớn
              lên cùng The Bếp.
            </p>
            <div className="hero-note">
              <Icon name="leaf" size={18} />
              <span>Đang chuẩn bị từng bước, cùng cách làm quen thuộc.</span>
            </div>
          </div>
          <div className="hero-art" aria-hidden="true">
            <div className="art-ring ring-one" />
            <div className="art-ring ring-two" />
            <div className="art-paper paper-back" />
            <div className="art-paper paper-front">
              <span className="paper-brand">
                The Bếp<span>TEAHOUSE</span>
              </span>
              <div className="paper-divider" />
              <span className="paper-label">MỖI NGÀY MỘT CHÚT CHỈN CHU</span>
              <div className="paper-row">
                <span className="paper-square" />
                <span className="paper-line" />
              </div>
              <div className="paper-row">
                <span className="paper-square" />
                <span className="paper-line short" />
              </div>
              <div className="paper-row">
                <span className="paper-square" />
                <span className="paper-line" />
              </div>
              <span className="paper-leaf">
                <Icon name="leaf" size={64} />
              </span>
            </div>
            <span className="art-seal">
              <Icon name="leaf" size={24} />
              MADE WITH CARE
            </span>
          </div>
        </section>
        <section className="entry-section" aria-labelledby="entry-title">
          <div className="section-heading">
            <div>
              <p className="eyebrow">KHÁM PHÁ GIAO DIỆN</p>
              <h2 id="entry-title">Chọn một góc nhìn</h2>
            </div>
            <p className="small muted">Chỉ xem bố cục · Chưa đăng nhập</p>
          </div>
          <div className="entry-grid">
            <Link className="role-card" href="/preview/manager">
              <span className="role-icon">
                <Icon name="grid" size={25} />
              </span>
              <div>
                <span className="role-label">DÀNH CHO QUẢN LÝ</span>
                <h3>Bao quát mỗi địa điểm</h3>
                <p className="muted">
                  Bố cục tổng quan cho công việc quản lý toàn hệ thống.
                </p>
                <span className="role-link">
                  Xem giao diện quản lý <Icon name="arrow" size={18} />
                </span>
              </div>
            </Link>
            <Link className="role-card" href="/preview/staff">
              <span className="role-icon">
                <Icon name="store" size={25} />
              </span>
              <div>
                <span className="role-label">DÀNH CHO NHÂN VIÊN</span>
                <h3>Tập trung vào công việc</h3>
                <p className="muted">
                  Bố cục đơn giản, thuận tiện cho màn hình điện thoại.
                </p>
                <span className="role-link">
                  Xem giao diện nhân viên <Icon name="arrow" size={18} />
                </span>
              </div>
            </Link>
          </div>
        </section>
        <div className="landing-bottom">
          <Card className="scope-card">
            <Icon name="shield" size={22} />
            <div>
              <h2>Một bước nền tảng</h2>
              <p className="small muted">
                Bản xem trước chưa có đăng nhập, số liệu kho hoặc thao tác
                nghiệp vụ. Công việc hằng ngày vẫn tiếp tục trên ứng dụng hiện
                tại.
              </p>
            </div>
          </Card>
          <ConnectionCard />
        </div>
      </main>
      <footer className="landing-footer">
        <span>THE BẾP TEAHOUSE</span>
        <span>Chăm chút từ những điều nhỏ nhất.</span>
      </footer>
    </div>
  );
}
