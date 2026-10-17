import { Wifi, WifiOff } from "lucide-react";
import type { ConnectionStatus } from "@/hooks/useRoomSession";

const LABELS: Record<ConnectionStatus, string> = {
  connecting: "در حال اتصال…",
  online: "متصل",
  offline: "قطع",
};

export function ConnectionStatusPill({ status }: { status: ConnectionStatus }) {
  const offline = status !== "online";
  return (
    <span
      className={`conn-pill ${status === "online" ? "conn-pill--ok" : "conn-pill--bad"}`}
      role="status"
      aria-live="polite"
    >
      {offline ? <WifiOff size={13} aria-hidden="true" /> : <Wifi size={13} aria-hidden="true" />}
      <span className="conn-pill__dot" aria-hidden="true" />
      {LABELS[status]}
    </span>
  );
}
