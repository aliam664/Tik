import {
  Compass,
  Crown,
  Flame,
  Gamepad2,
  Rocket,
  Shield,
  Sparkles,
  Swords,
  Target,
  Trophy,
} from "lucide-react";
import type { PlatformGameIcon } from "./registry";

export function GameIcon({ icon, size = 22 }: { icon: PlatformGameIcon; size?: number }) {
  switch (icon) {
    case "grid":
      return <Gamepad2 size={size} aria-hidden="true" />;
    case "rocket":
      return <Rocket size={size} aria-hidden="true" />;
    case "swords":
      return <Swords size={size} aria-hidden="true" />;
    case "crown":
      return <Crown size={size} aria-hidden="true" />;
    case "flame":
      return <Flame size={size} aria-hidden="true" />;
    case "shield":
      return <Shield size={size} aria-hidden="true" />;
    case "target":
      return <Target size={size} aria-hidden="true" />;
    case "trophy":
      return <Trophy size={size} aria-hidden="true" />;
    case "sparkles":
      return <Sparkles size={size} aria-hidden="true" />;
    case "compass":
      return <Compass size={size} aria-hidden="true" />;
  }
}
