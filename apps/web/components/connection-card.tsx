import { parseBackendOrigin } from "../lib/backend-origin";
import { HealthStatus } from "./health-status";
import { Card } from "./ui/card";

export function ConnectionCard() {
  const backendOrigin = parseBackendOrigin(process.env.BEP_API_ORIGIN);
  return (
    <Card className="connection-card">
      <div className="eyebrow">KẾT NỐI HỆ THỐNG</div>
      <HealthStatus configured={Boolean(backendOrigin)} />
      {backendOrigin ? (
        <a href={backendOrigin} className="text-link">
          Mở ứng dụng hiện tại <span aria-hidden="true">↗</span>
        </a>
      ) : null}
    </Card>
  );
}
