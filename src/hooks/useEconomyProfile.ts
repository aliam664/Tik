import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { toUserError } from "@/lib/errors";
import { playerIdentity } from "@/lib/playerSession";
import type { PlayerProfile } from "@/types/api";

export interface EconomyProfileView extends PlayerProfile {
  coins: number;
}

export function useEconomyProfile() {
  const [token, setToken] = useState<string | null>(() => playerIdentity.token());
  const [profile, setProfile] = useState<EconomyProfileView | null>(null);
  const [loading, setLoading] = useState(false);

  const refreshProfile = useCallback(async () => {
    setLoading(true);
    try {
      const currentToken = playerIdentity.token();
      if (currentToken) {
        try {
          const res = await api.getMyProfile(currentToken);
          setToken(currentToken);
          setProfile({
            ...res.profile,
            coins: res.profile.balance,
          });
          return;
        } catch (err) {
          const code = toUserError(err).code;
          if (code === "PLAYER_BANNED") {
            playerIdentity.clear();
            setToken(null);
            setProfile(null);
            return;
          }
          if (code !== "PLAYER_UNAUTHORIZED") {
            throw err;
          }
          // Stale or revoked token: clear it and fall through to auto-register a fresh profile.
          playerIdentity.clear();
          setToken(null);
        }
      }

      // Auto-register a persistent Sheriff Coin wallet profile so players immediately have a wallet
      const registered = await api.registerPlayer("شوالیه شب");
      playerIdentity.save({
        token: registered.player_token,
        displayName: registered.profile.display_name,
        recoveryCode: registered.recovery_code ?? "",
        createdAt: new Date().toISOString(),
      });
      setToken(registered.player_token);
      setProfile({
        ...registered.profile,
        coins: registered.profile.balance,
      });
    } catch {
      // Offline / fallback safe
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshProfile();
  }, [refreshProfile]);

  return {
    token,
    profile,
    loading,
    refreshProfile,
  };
}
