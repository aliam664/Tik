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
const PlayPage = lazy(() =>
  import("@/features/play/PlayPage").then((m) => ({ default: m.PlayPage })),
);
const ProfilePage = lazy(() =>
  import("@/features/profile/ProfilePage").then((m) => ({ default: m.ProfilePage })),
);
const LeaderboardPage = lazy(() =>
  import("@/features/leaderboard/LeaderboardPage").then((m) => ({ default: m.LeaderboardPage })),
);
const ShopPage = lazy(() =>
  import("@/features/shop/ShopPage").then((m) => ({ default: m.ShopPage })),
);
const LastNightLobbyPage = lazy(() =>
  import("@/features/lastNight/LastNightLobbyPage").then((m) => ({
    default: m.LastNightLobbyPage,
  })),
);
const LastNightRoomPage = lazy(() =>
  import("@/features/lastNight/LastNightRoomPage").then((m) => ({
    default: m.LastNightRoomPage,
  })),
);
const WordCipherLobbyPage = lazy(() =>
  import("@/features/wordGame/WordCipherLobbyPage").then((m) => ({
    default: m.WordCipherLobbyPage,
  })),
);
const WordCipherRoomPage = lazy(() =>
  import("@/features/wordGame/WordCipherRoomPage").then((m) => ({
    default: m.WordCipherRoomPage,
  })),
);
const CodeBreakerLobbyPage = lazy(() =>
  import("@/features/codeBreaker/CodeBreakerLobbyPage").then((m) => ({
    default: m.CodeBreakerLobbyPage,
  })),
);
const CodeBreakerRoomPage = lazy(() =>
  import("@/features/codeBreaker/CodeBreakerRoomPage").then((m) => ({
    default: m.CodeBreakerRoomPage,
  })),
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
          <Route path="/play" element={<PlayPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/leaderboard" element={<LeaderboardPage />} />
          <Route path="/shop" element={<ShopPage />} />
          <Route path="/rules" element={<RulesPage />} />
          <Route path="/privacy" element={<PrivacyPage />} />
          <Route path="/admin" element={<AdminPage />} />
          <Route path="/games/last-night" element={<LastNightLobbyPage />} />
          <Route path="/games/last-night/room/:roomCode" element={<LastNightRoomPage />} />
          <Route path="/games/arena2d" element={<LastNightLobbyPage />} />
          <Route path="/games/word-cipher" element={<WordCipherLobbyPage />} />
          <Route path="/games/word-cipher/room/:roomCode" element={<WordCipherRoomPage />} />
          <Route path="/games/code-breaker" element={<CodeBreakerLobbyPage />} />
          <Route path="/games/code-breaker/room/:roomCode" element={<CodeBreakerRoomPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </PageShell>
  );
}
