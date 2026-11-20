"use client";

import { useEffect, useState } from "react";
import { createInventoryClient } from "@bep/api-client";
import { Button } from "./ui/button";

type Status = "loading" | "ready" | "error";

export function HealthStatus({ configured }: { configured: boolean }) {
  const [status, setStatus] = useState<Status>("loading");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!configured) return;
    let active = true;
    const controller = new AbortController();
    const client = createInventoryClient({ baseUrl: "" });
    client
      .health({ signal: controller.signal })
      .then(() => {
        if (active) setStatus("ready");
      })
      .catch(() => {
        if (active) setStatus("error");
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [configured, attempt]);

  const label = !configured
    ? "Chưa cấu hình kết nối"
    : status === "loading"
      ? "Đang kiểm tra kết nối…"
      : status === "ready"
        ? "API đang phản hồi"
        : "Chưa kết nối được API";
  return (
    <div className="health-block">
      <div className="health-line" role="status" aria-live="polite">
        <span
          className={`status-dot ${configured && status === "ready" ? "is-ready" : ""}`}
        />
        <span>{label}</span>
      </div>
      <p className="small muted">
        {!configured
          ? "Bản xem trước chưa chọn máy chủ dữ liệu."
          : "Chỉ kiểm tra trạng thái máy chủ. Chưa đăng nhập hoặc tải dữ liệu kho."}
      </p>
      {configured && status === "error" ? (
        <Button
          className="button-secondary button-small"
          onClick={() => {
            setStatus("loading");
            setAttempt((value) => value + 1);
          }}
        >
          Thử kết nối lại
        </Button>
      ) : null}
    </div>
  );
}
