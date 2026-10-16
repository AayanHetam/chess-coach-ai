import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import {
  type AccountState,
  type ChessPlatform,
  PROFILE_FIELD,
  profileUsername,
  readDeviceUsername,
  rememberTarget,
  savedUsername,
  writeDeviceUsername,
} from "@/lib/chessAccounts";

export interface ChessUsernames {
  /** The reader's saved username for a platform ("" when none). */
  saved: (platform: ChessPlatform) => string;
  /**
   * Save `username` as the reader's own if they have none for the platform
   * yet. Resolves to where it went: "profile" (worth telling them), "device",
   * or null when nothing was saved.
   */
  remember: (
    platform: ChessPlatform,
    username: string
  ) => Promise<"profile" | "device" | null>;
}

/** The reader's own Chess.com and Lichess usernames (see lib/chessAccounts). */
export function useChessUsernames(): ChessUsernames {
  const { user, profile, loading, updateProfile } = useAuth();
  const [device, setDevice] = useState<Record<ChessPlatform, string>>({
    chesscom: "",
    lichess: "",
  });

  // Storage is read after mount so the first client render matches the server.
  useEffect(() => {
    setDevice({
      chesscom: readDeviceUsername("chesscom"),
      lichess: readDeviceUsername("lichess"),
    });
  }, []);

  // A cached account paints before /api/auth/me answers, with no profile yet.
  const account: AccountState = profile
    ? "signed-in"
    : user || loading
      ? "loading"
      : "signed-out";

  const saved = useCallback(
    (platform: ChessPlatform) =>
      savedUsername(platform, profile, device[platform]),
    [profile, device]
  );

  const remember = useCallback(
    async (platform: ChessPlatform, username: string) => {
      const name = username.trim();
      const target = rememberTarget({
        account,
        profileValue: profileUsername(profile, platform),
        deviceValue: readDeviceUsername(platform),
        username: name,
      });
      if (target === "profile") {
        await updateProfile({ [PROFILE_FIELD[platform]]: name });
      } else if (target === "device") {
        writeDeviceUsername(platform, name);
        setDevice((d) => ({ ...d, [platform]: name }));
      }
      return target;
    },
    [account, profile, updateProfile]
  );

  return { saved, remember };
}
