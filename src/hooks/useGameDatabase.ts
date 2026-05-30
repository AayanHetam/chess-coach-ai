import { formatGameToDatabase } from "@/lib/chess";
import { GameEval } from "@/types/eval";
import { Game, SavedCoachMessage } from "@/types/game";
import { Chess } from "chess.js";
import { openDB, DBSchema, IDBPDatabase } from "idb";
import { atom, useAtom } from "jotai";
import { useRouter } from "next/router";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import {
  addCloudGame,
  updateCloudGameTranscript,
  deleteCloudGame,
  getCloudGames,
  updateCloudGameEval,
} from "@/lib/firestoreGames";

interface GameDatabaseSchema extends DBSchema {
  games: {
    value: Game & { firestoreId?: string };
    key: number;
  };
}

const gamesAtom = atom<Game[]>([]);
const fetchGamesAtom = atom<boolean>(false);

export const useGameDatabase = (shouldFetchGames?: boolean) => {
  const [db, setDb] = useState<IDBPDatabase<GameDatabaseSchema> | null>(null);
  const [games, setGames] = useAtom(gamesAtom);
  const [fetchGames, setFetchGames] = useAtom(fetchGamesAtom);
  const [gameFromUrl, setGameFromUrl] = useState<Game | undefined>(undefined);
  const { user } = useAuth();
  const cloudSyncDone = useRef(false);

  useEffect(() => {
    if (shouldFetchGames !== undefined) {
      setFetchGames(shouldFetchGames);
    }
  }, [shouldFetchGames, setFetchGames]);

  useEffect(() => {
    const initDatabase = async () => {
      const db = await openDB<GameDatabaseSchema>("games", 1, {
        upgrade(db) {
          db.createObjectStore("games", { keyPath: "id", autoIncrement: true });
        },
      });
      setDb(db);
    };

    initDatabase();
  }, []);

  const loadGames = useCallback(async () => {
    if (db && fetchGames) {
      const games = await db.getAll("games");
      setGames(games);
    }
  }, [db, fetchGames, setGames]);

  useEffect(() => {
    loadGames();
  }, [loadGames]);

  // Cloud sync: pull cloud games into local DB on login
  useEffect(() => {
    if (!user || !db || !fetchGames || cloudSyncDone.current) return;

    const syncFromCloud = async () => {
      try {
        const cloudGames = await getCloudGames(user.uid);
        const localGames = await db.getAll("games");

        // Find cloud games not yet in local DB (by firestoreId)
        const localFirestoreIds = new Set(
          localGames
            .map((g) => (g as Game & { firestoreId?: string }).firestoreId)
            .filter(Boolean)
        );

        for (const cloudGame of cloudGames) {
          if (!localFirestoreIds.has(cloudGame.firestoreId)) {
            const { firestoreId, createdAt, updatedAt, ...gameData } = cloudGame;
            await db.add("games", {
              ...gameData,
              firestoreId,
            } as Game & { firestoreId?: string });
          }
        }

        cloudSyncDone.current = true;
        loadGames();
      } catch (error) {
        console.error("Cloud sync failed:", error);
      }
    };

    syncFromCloud();
  }, [user, db, fetchGames, loadGames]);

  // Reset cloud sync flag when user changes
  useEffect(() => {
    cloudSyncDone.current = false;
  }, [user?.uid]);

  const addGame = useCallback(
    async (game: Chess) => {
      if (!db) throw new Error("Database not initialized");

      const gameToAdd = formatGameToDatabase(game);

      // Save to cloud first if logged in
      let firestoreId: string | undefined;
      if (user) {
        try {
          firestoreId = await addCloudGame(user.uid, gameToAdd);
        } catch (error) {
          console.error("Cloud save failed, saving locally:", error);
        }
      }

      const gameId = await db.add("games", {
        ...gameToAdd,
        ...(firestoreId ? { firestoreId } : {}),
      } as Game & { firestoreId?: string });

      loadGames();

      return gameId;
    },
    [db, loadGames, user]
  );

  const setGameEval = useCallback(
    async (gameId: number, evaluation: GameEval) => {
      if (!db) throw new Error("Database not initialized");

      const game = await db.get("games", gameId);
      if (!game) throw new Error("Game not found");

      await db.put("games", { ...game, eval: evaluation });

      // Sync eval to cloud
      const gameWithFirestore = game as Game & { firestoreId?: string };
      if (user && gameWithFirestore.firestoreId) {
        try {
          await updateCloudGameEval(
            user.uid,
            gameWithFirestore.firestoreId,
            evaluation
          );
        } catch (error) {
          console.error("Cloud eval sync failed:", error);
        }
      }

      loadGames();
    },
    [db, loadGames, user]
  );

  /**
   * Persist the coach conversation to the saved game record. Mirrors the
   * setGameEval pattern: write to IndexedDB first, then best-effort PATCH the
   * cloud copy when the user is signed in. Failures are swallowed so a
   * Firestore hiccup never breaks the chat UX — the local copy is still
   * correct and the next successful write replaces what's in the cloud.
   */
  const setGameTranscript = useCallback(
    async (gameId: number, coachTranscript: SavedCoachMessage[]) => {
      if (!db) return;

      const game = await db.get("games", gameId);
      if (!game) return;

      await db.put("games", { ...game, coachTranscript });

      const gameWithFirestore = game as Game & { firestoreId?: string };
      if (user && gameWithFirestore.firestoreId) {
        try {
          await updateCloudGameTranscript(
            user.uid,
            gameWithFirestore.firestoreId,
            coachTranscript
          );
        } catch (error) {
          console.error("Cloud transcript sync failed:", error);
        }
      }

      loadGames();
    },
    [db, loadGames, user]
  );

  const getGame = useCallback(
    async (gameId: number) => {
      if (!db) return undefined;

      return db.get("games", gameId);
    },
    [db]
  );

  const deleteGame = useCallback(
    async (gameId: number) => {
      if (!db) throw new Error("Database not initialized");

      // Delete from cloud if logged in
      const game = await db.get("games", gameId);
      const gameWithFirestore = game as
        | (Game & { firestoreId?: string })
        | undefined;
      if (user && gameWithFirestore?.firestoreId) {
        try {
          await deleteCloudGame(user.uid, gameWithFirestore.firestoreId);
        } catch (error) {
          console.error("Cloud delete failed:", error);
        }
      }

      await db.delete("games", gameId);

      loadGames();
    },
    [db, loadGames, user]
  );

  const router = useRouter();
  const { gameId } = router.query;

  useEffect(() => {
    switch (typeof gameId) {
      case "string":
        getGame(parseInt(gameId)).then((game) => {
          setGameFromUrl(game);
        });
        break;
      default:
        setGameFromUrl(undefined);
    }
  }, [gameId, setGameFromUrl, getGame]);

  const isReady = db !== null;

  return {
    addGame,
    setGameEval,
    setGameTranscript,
    getGame,
    deleteGame,
    games,
    isReady,
    gameFromUrl,
  };
};
