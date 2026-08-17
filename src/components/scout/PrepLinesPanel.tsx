// The "Customize vs me" report — the line to play against this specific person.
//
// The hard part of this panel is not the layout, it is refusing to oversell. On
// a solid opponent the honest answer is "no confirmed weakness, here is the best
// available prep", and that has to read as a real answer rather than a failure.
// So the tier is stated in the header, every line carries the sample it rests
// on, and nothing says "weakness" unless the screen confirmed one.

import { useState } from 'react';
import {
  Box,
  Button,
  LinearProgress,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from '@mui/material';
import { Icon } from '@iconify/react';
import type { Hole, HoleReport, HoleTier } from '@/lib/scout/holeFinder';
import type { HoleProgress } from '@/lib/scout/useHoleReport';
import { DossierPanel, EMBER, EMBER_LIGHT, FieldLabel, MONO, VerdictPill } from './dossier';

const CONFIRMED = '#34d399';
const SIGNAL = EMBER_LIGHT;
const PREP = 'rgba(255,255,255,0.5)';

const TIER_COLOR: Record<HoleTier, string> = {
  confirmed: CONFIRMED,
  signal: SIGNAL,
  prep: PREP,
};

const TIER_LABEL: Record<HoleTier, string> = {
  confirmed: 'Confirmed',
  signal: 'Strong signal',
  prep: 'Prep only',
};

const TIER_HELP: Record<HoleTier, string> = {
  confirmed:
    'They score below their own baseline here, and the gap survives correcting for how many lines were searched. This is a real weakness.',
  signal:
    'They do score badly here, but the gap is not large enough to prove given how many lines were searched. Worth playing; not a claim about their game.',
  prep: 'No results evidence at this depth. This is simply the soundest line to aim for.',
};

export interface PrepLinesPanelProps {
  report: HoleReport | null;
  progress: HoleProgress;
  error: string | null;
  theirName: string;
  yourColor: 'white' | 'black';
  onColorChange: (c: 'white' | 'black') => void;
  onRun: () => void;
  onExplore?: (moves: string[], yourColor: 'white' | 'black') => void;
}

export default function PrepLinesPanel({
  report,
  progress,
  error,
  theirName,
  yourColor,
  onColorChange,
  onRun,
  onExplore,
}: PrepLinesPanelProps) {
  const running = progress.phase === 'evaluating' || progress.phase === 'reading' || progress.phase === 'ranking';

  return (
    <DossierPanel
      label="Customize vs me · your line against them"
      emphasis
      action={
        report ? (
          <VerdictPill
            label={report.confirmedWeakness ? 'Weakness confirmed' : 'Best available prep'}
            color={report.confirmedWeakness ? CONFIRMED : 'rgba(255,255,255,0.45)'}
          />
        ) : undefined
      }
    >
      <Stack direction="row" spacing={1.5} alignItems="center" sx={{ flexWrap: 'wrap', gap: 1.5 }}>
        <ToggleButtonGroup
          size="small"
          exclusive
          value={yourColor}
          onChange={(_, v) => v && onColorChange(v)}
          disabled={running}
          sx={{
            '& .MuiToggleButton-root': {
              fontFamily: MONO,
              fontSize: '0.62rem',
              letterSpacing: '0.12em',
              px: 1.5,
              py: 0.5,
              color: 'rgba(255,255,255,0.55)',
              borderColor: 'rgba(255,255,255,0.12)',
              '&.Mui-selected': {
                color: EMBER_LIGHT,
                borderColor: 'rgba(249,115,22,0.45)',
                bgcolor: 'rgba(249,115,22,0.10)',
              },
            },
          }}
        >
          <ToggleButton value="white">YOU AS WHITE</ToggleButton>
          <ToggleButton value="black">YOU AS BLACK</ToggleButton>
        </ToggleButtonGroup>

        <Button
          onClick={onRun}
          disabled={running}
          startIcon={<Icon icon={running ? 'mdi:loading' : 'mdi:target-account'} width={16} />}
          sx={{
            fontFamily: MONO,
            fontSize: '0.64rem',
            letterSpacing: '0.12em',
            px: 2,
            color: '#0b0c0f',
            bgcolor: EMBER,
            '&:hover': { bgcolor: EMBER_LIGHT },
            '&.Mui-disabled': { bgcolor: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.4)' },
          }}
        >
          {report ? 'REBUILD' : 'BUILD MY PREP'}
        </Button>
      </Stack>

      {running && (
        <Box sx={{ mt: 2 }}>
          <LinearProgress
            variant="determinate"
            value={Math.round(progress.fraction * 100)}
            sx={{
              height: 4,
              borderRadius: 2,
              bgcolor: 'rgba(255,255,255,0.07)',
              '& .MuiLinearProgress-bar': { bgcolor: EMBER },
            }}
          />
          <FieldLabel color="rgba(255,255,255,0.42)" size="0.57rem">
            {progress.label}
          </FieldLabel>
        </Box>
      )}

      {error && (
        <Stack direction="row" spacing={0.75} alignItems="center" sx={{ mt: 2 }}>
          <Box sx={{ color: '#fbbf24', display: 'flex' }}>
            <Icon icon="mdi:alert-outline" width={13} />
          </Box>
          <Typography sx={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.7)' }}>{error}</Typography>
        </Stack>
      )}

      {report && !running && <ReportBody report={report} theirName={theirName} yourColor={yourColor} onExplore={onExplore} />}

      {!report && !running && !error && (
        <Typography sx={{ mt: 2, fontSize: '0.84rem', color: 'rgba(255,255,255,0.55)', lineHeight: 1.5 }}>
          Finds where {theirName} scores worst across every move order that reaches it, checks the
          line is sound for you, and gives you the move to play. Their recent games count for more
          than their old ones.
        </Typography>
      )}
    </DossierPanel>
  );
}

function ReportBody({
  report,
  theirName,
  yourColor,
  onExplore,
}: {
  report: HoleReport;
  theirName: string;
  yourColor: 'white' | 'black';
  onExplore?: (moves: string[], yourColor: 'white' | 'black') => void;
}) {
  if (report.noHoleFound) {
    return (
      <Box sx={{ mt: 2.5 }}>
        <Typography sx={{ fontSize: '0.86rem', color: 'rgba(255,255,255,0.75)', lineHeight: 1.55 }}>
          Nothing worth recommending. {theirName} scores about the same wherever the game goes, and
          no line was worth the ground it costs to reach.
        </Typography>
        <Evidence report={report} />
      </Box>
    );
  }

  return (
    <Box sx={{ mt: 2.5 }}>
      {!report.confirmedWeakness && (
        <Typography
          sx={{ fontSize: '0.84rem', color: 'rgba(255,255,255,0.62)', lineHeight: 1.5, mb: 2 }}
        >
          No weakness survived correcting for the size of the search — normal against a solid
          player. These are the lines the evidence still favours.
        </Typography>
      )}

      <Stack spacing={1.25}>
        {report.holes.map((h, i) => (
          <LineRow
            key={h.line.map(m => m.san).join(' ')}
            hole={h}
            rank={i + 1}
            theirName={theirName}
            onExplore={onExplore ? () => onExplore(h.line.map(m => m.san), yourColor) : undefined}
          />
        ))}
      </Stack>

      <Evidence report={report} />
    </Box>
  );
}

function LineRow({
  hole,
  rank,
  theirName,
  onExplore,
}: {
  hole: Hole;
  rank: number;
  theirName: string;
  onExplore?: () => void;
}) {
  const [open, setOpen] = useState(rank === 1);
  const color = TIER_COLOR[hole.tier];

  return (
    <Box
      sx={{
        border: '1px solid rgba(255,255,255,0.08)',
        borderLeft: `2px solid ${color}`,
        borderRadius: '6px',
        p: 1.5,
        bgcolor: rank === 1 ? 'rgba(249,115,22,0.05)' : 'rgba(255,255,255,0.02)',
      }}
    >
      <Stack
        direction="row"
        alignItems="center"
        spacing={1.25}
        sx={{ cursor: 'pointer' }}
        onClick={() => setOpen(o => !o)}
      >
        <Typography
          sx={{
            fontFamily: MONO,
            fontSize: '1.05rem',
            fontWeight: 700,
            color,
            fontVariantNumeric: 'tabular-nums',
            minWidth: 52,
          }}
        >
          +{(hole.benefit * 100).toFixed(1)}
        </Typography>

        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography
            sx={{
              fontFamily: MONO,
              fontSize: '0.8rem',
              color: 'rgba(255,255,255,0.92)',
              lineHeight: 1.4,
              wordBreak: 'break-word',
            }}
          >
            {hole.line.map((m, i) => (
              <Box
                key={i}
                component="span"
                sx={{
                  color: m.side === 'you' ? EMBER_LIGHT : 'rgba(255,255,255,0.78)',
                  fontWeight: m.side === 'you' ? 700 : 400,
                }}
              >
                {i % 2 === 0 ? `${i / 2 + 1}.` : ''}
                {m.san}{' '}
              </Box>
            ))}
          </Typography>
        </Box>

        <Tooltip arrow title={TIER_HELP[hole.tier]}>
          <Box sx={{ display: 'flex' }}>
            <VerdictPill label={TIER_LABEL[hole.tier]} color={color} />
          </Box>
        </Tooltip>
      </Stack>

      {open && (
        <Box sx={{ mt: 1.5, pt: 1.5, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          <Stack direction="row" spacing={3} sx={{ flexWrap: 'wrap', gap: 1.5, mb: 1.25 }}>
            <Stat label="Their score here" value={`${(hole.score * 100).toFixed(1)}%`} sub={`vs ${(hole.baseline * 100).toFixed(1)}% overall`} />
            <Stat label="Their games" value={`${hole.games}`} sub={`effective ${hole.neff.toFixed(0)}`} />
            <Stat label="You reach it" value={`${(hole.reach * 100).toFixed(0)}%`} sub="of games" />
            <Stat
              label="Ground you give"
              value={hole.concessionCp === 0 ? 'none' : `${hole.concessionCp}cp`}
              sub={hole.concessionCp === 0 ? 'engine’s own choice' : 'below best'}
            />
          </Stack>

          {hole.keyMove && (
            <Stack direction="row" spacing={0.75} alignItems="center" sx={{ mb: 0.75 }}>
              <Box sx={{ color: EMBER_LIGHT, display: 'flex' }}>
                <Icon icon="mdi:arrow-right-bold" width={13} />
              </Box>
              <Typography sx={{ fontSize: '0.82rem', color: 'rgba(255,255,255,0.88)' }}>
                Play <strong>{hole.keyMove}</strong>
                {hole.punish && (
                  <>
                    {' '}
                    — after their reply, <strong>{hole.punish}</strong>
                  </>
                )}
              </Typography>
            </Stack>
          )}

          {hole.cpLoss !== undefined && hole.cpLoss > 0 && hole.betterMove && (
            <Typography sx={{ fontSize: '0.79rem', color: 'rgba(255,255,255,0.55)' }}>
              Their {hole.line[hole.line.length - 1].san} gives up {hole.cpLoss}cp; the engine
              prefers {hole.betterMove}.
            </Typography>
          )}

          <Typography sx={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.4)', mt: 0.75 }}>
            {hole.p === undefined
              ? 'Sample too small to test — ranked on soundness, not on their results.'
              : `p = ${hole.p < 0.001 ? hole.p.toExponential(1) : hole.p.toFixed(3)} against ${theirName}’s own baseline.`}
          </Typography>

          {onExplore && (
            <Button
              size="small"
              onClick={onExplore}
              startIcon={<Icon icon="mdi:file-tree-outline" width={14} />}
              sx={{
                mt: 1,
                fontFamily: MONO,
                fontSize: '0.6rem',
                letterSpacing: '0.1em',
                color: 'rgba(255,255,255,0.6)',
                px: 1,
              }}
            >
              OPEN IN EXPLORER
            </Button>
          )}
        </Box>
      )}
    </Box>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Box>
      <FieldLabel color="rgba(255,255,255,0.35)" size="0.53rem">
        {label}
      </FieldLabel>
      <Typography
        sx={{
          fontFamily: MONO,
          fontSize: '0.92rem',
          fontWeight: 700,
          color: 'rgba(255,255,255,0.9)',
          lineHeight: 1.2,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {value}
      </Typography>
      {sub && (
        <Typography sx={{ fontSize: '0.66rem', color: 'rgba(255,255,255,0.38)' }}>{sub}</Typography>
      )}
    </Box>
  );
}

/**
 * What the numbers rest on. Shown always, not behind a disclosure — a report
 * that screened 160 lines to find one at p=0.003 is a different object from one
 * that screened three, and the reader cannot judge the claim without it.
 */
function Evidence({ report }: { report: HoleReport }) {
  return (
    <Typography
      sx={{
        mt: 2,
        pt: 1.5,
        borderTop: '1px solid rgba(255,255,255,0.06)',
        fontSize: '0.71rem',
        color: 'rgba(255,255,255,0.38)',
        lineHeight: 1.6,
      }}
    >
      {report.baselineGames.toLocaleString()} of their games · {report.tests} independent lines
      screened · {report.evaluated} positions evaluated
      {report.unavailable > 0 && ` (${report.unavailable} with no engine answer)`}
      {report.budgetExhausted && ' · engine budget reached, deeper lines not checked'}
      . Recent games count for more; a game a year old counts half.
    </Typography>
  );
}
