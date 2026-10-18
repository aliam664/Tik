import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { PageShell } from "@/components/layout/PageShell";
import { LoadingSpinner } from "@/components/ui/Feedback";

const HomePage = lazy(() =>
  import("@/features/home/HomePage").then((m) => ({ default: m.HomePage })),
);
const CreateRoomPage = lazy(() =>
  import("@/features/rooms/CreateRoomPage").then((m) => ({ default: m.CreateRoomPage })),
);
const JoinRoomPage = lazy(() =>
  import("@/features/rooms/JoinRoomPage").then((m) => ({ default: m.JoinRoomPage })),
);
const RulesPage = lazy(() =>
  import("@/features/rooms/RulesPage").then((m) => ({ default: m.RulesPage })),
);
const PrivacyPage = lazy(() =>
  import("@/features/rooms/PrivacyPage").then((m) => ({ default: m.PrivacyPage })),
);
const RoomPage = lazy(() =>
  import("@/features/game/RoomPage").then((m) => ({ default: m.RoomPage })),
);
const AdminPage = lazy(() =>
  import("@/features/admin/AdminPage").then((m) => ({ default: m.AdminPage })),
);

function RouteFallback() {
  return (
    <div className="route-fallback">
      <LoadingSpinner size={26} label="در حال بارگذاری صفحه" />
    </div>
  );
}

export function AppRouter() {
  return (
    <PageShell>
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/create" element={<CreateRoomPage />} />
          <Route path="/join" element={<JoinRoomPage />} />
          <Route path="/room/:roomCode" element={<RoomPage />} />
          <Route path="/rules" element={<RulesPage />} />
          <Route path="/privacy" element={<PrivacyPage />} />
          <Route path="/admin" element={<AdminPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </PageShell>
  );
}
