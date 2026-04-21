import { Box, Stack, Typography } from "@mui/material";
import { useAtomValue } from "jotai";
import { useGameDatabase } from "@/hooks/useGameDatabase";
import { gameAtom, gameEvalAtom, visibleSectionsAtom } from "../states";
import SectionCard from "./sectionCard";
import GraphTab from "./graphTab";
import EngineLines from "./analysisTab/engineLines";
import PlayersMetric from "./analysisTab/playersMetric";
import MovesClassificationsRecap from "./classificationTab/movesClassificationsRecap";
import MovesPanel from "./classificationTab/movesPanel";
import Opening from "./analysisTab/opening";
import MoveInfo from "./analysisTab/moveInfo";

export default function UnifiedSections() {
  const visible = useAtomValue(visibleSectionsAtom);
  const gameEval = useAtomValue(gameEvalAtom);
  const game = useAtomValue(gameAtom);
  const { gameFromUrl } = useGameDatabase();
  const gameHeaders = game.getHeaders();

  const site = gameFromUrl?.site || gameHeaders.Site || "—";
  const date = gameFromUrl?.date || gameHeaders.Date || "—";
  const termination =
    gameFromUrl?.termination || gameHeaders.Termination || "";
  const result =
    termination && termination.split(" ").length > 2
      ? termination
      : gameFromUrl?.result || gameHeaders.Result || "—";
  const whiteName = gameFromUrl?.white?.name || gameHeaders.White || "—";
  const blackName = gameFromUrl?.black?.name || gameHeaders.Black || "—";

  if (visible.length === 0) return null;

  return (
    <Stack spacing={1} sx={{ width: "100%", px: 1, pb: 1 }}>
      {visible.includes("graph") && (
        <SectionCard id="graph" title="Evaluation Graph" icon="mdi:chart-line">
          {gameEval ? (
            <GraphTab />
          ) : (
            <Typography
              fontSize="0.8rem"
              color="text.secondary"
              sx={{ textAlign: "center", py: 1.5 }}
            >
              Run analysis to see the evaluation graph.
            </Typography>
          )}
        </SectionCard>
      )}

      {visible.includes("engine") && (
        <SectionCard id="engine" title="Engine Analysis" icon="mdi:fish">
          <Box sx={{ width: "100%" }}>
            <MoveInfo />
            <Opening />
            <EngineLines size={{ xs: 12 }} />
          </Box>
        </SectionCard>
      )}

      {visible.includes("stats") && (
        <SectionCard
          id="stats"
          title="Game Statistics"
          icon="mdi:chart-bar"
          maxHeight={260}
        >
          {gameEval ? (
            <Stack spacing={1} alignItems="center" sx={{ width: "100%" }}>
              <PlayersMetric
                title="Accuracy"
                whiteValue={`${gameEval.accuracy.white.toFixed(1)} %`}
                blackValue={`${gameEval.accuracy.black.toFixed(1)} %`}
              />
              {gameEval.estimatedElo && (
                <PlayersMetric
                  title="Game Rating"
                  whiteValue={Math.round(gameEval.estimatedElo.white)}
                  blackValue={Math.round(gameEval.estimatedElo.black)}
                />
              )}
              <Box sx={{ width: "100%", mt: 1 }}>
                <MovesClassificationsRecap />
              </Box>
            </Stack>
          ) : (
            <Typography
              fontSize="0.8rem"
              color="text.secondary"
              sx={{ textAlign: "center", py: 1.5 }}
            >
              Run analysis to see game statistics.
            </Typography>
          )}
        </SectionCard>
      )}

      {visible.includes("gameInfo") && (
        <SectionCard
          id="gameInfo"
          title="Game Info"
          icon="mdi:information-outline"
        >
          <Stack spacing={0.5} sx={{ fontSize: "0.85rem" }}>
            <InfoRow label="White" value={whiteName} />
            <InfoRow label="Black" value={blackName} />
            <InfoRow label="Site" value={site} />
            <InfoRow label="Date" value={date} />
            <InfoRow label="Result" value={result} />
          </Stack>
        </SectionCard>
      )}

      {visible.includes("moves") && (
        <SectionCard
          id="moves"
          title="Moves Played"
          icon="mdi:format-list-bulleted"
          maxHeight={280}
        >
          <MovesPanel />
        </SectionCard>
      )}
    </Stack>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <Stack
      direction="row"
      justifyContent="space-between"
      sx={{ fontSize: "0.8rem" }}
    >
      <Typography fontSize="0.8rem" color="text.secondary">
        {label}
      </Typography>
      <Typography fontSize="0.8rem" sx={{ fontWeight: 500 }} noWrap>
        {value}
      </Typography>
    </Stack>
  );
}
