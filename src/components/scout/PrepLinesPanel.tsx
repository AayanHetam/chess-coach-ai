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
import type { PreparedLine, PreparedMove } from '@/lib/scout/preparedLine';
import type { MasterView } from '@/lib/master/ideas';
import { useMasterIdeas, type MasterContext } from '@/lib/master/useMasterIdeas';
import type { HoleProgress } from '@/lib/scout/useHoleReport';
import { DossierPanel, EMBER, EMBER_LIGHT, FieldLabel, MONO, VerdictPill } from './dossier';

const CONFIRMED = '#34d399';
const SIGNAL = EMBER_LIGHT;
const PREP = 'rgba(255,255,255,0.5)';
const BAD = '#f87171';

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
  // Loaded alongside the report rather than inside it — see useMasterIdeas.
  const master = useMasterIdeas(report?.holes, yourColor);

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

          {report && !running && (
        <ReportBody
          report={report}
          theirName={theirName}
          yourColor={yourColor}
          onExplore={onExplore}
          master={master}
        />
      )}

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
  master,
}: {
  report: HoleReport;
  theirName: string;
  yourColor: 'white' | 'black';
  onExplore?: (moves: string[], yourColor: 'white' | 'black') => void;
  master: MasterContext;
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
            master={master}
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
  master,
  onExplore,
}: {
  hole: Hole;
  rank: number;
  theirName: string;
  master: MasterContext;
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
            {hole.you && (
              <Stat
                label="You score here"
                value={`${(hole.you.score * 100).toFixed(0)}%`}
                sub={`${hole.you.games} games · vs your ${(hole.you.baseline * 100).toFixed(0)}%`}
                tone={hole.you.surplus >= 0 ? CONFIRMED : BAD}
              />
            )}
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

          {hole.prepared && hole.prepared.length > 0 && (
            <Box sx={{ mt: 1.75 }}>
              <FieldLabel color="rgba(255,255,255,0.35)" size="0.53rem">
                {hole.prepared.length > 1
                  ? `The lines from here — they split ${hole.prepared.length} ways`
                  : 'The line from here'}
              </FieldLabel>
              <Stack spacing={1.25} sx={{ mt: 1 }}>
                {hole.prepared.map((line, i) => (
                  <PreparedLineBlock
                    key={i}
                    line={line}
                    startPly={hole.line.length}
                    master={master}
                  />
                ))}
              </Stack>
            </Box>
          )}

          {hole.you && hole.you.surplus < -0.01 && (
            <Stack direction="row" spacing={0.75} alignItems="center" sx={{ mb: 0.75 }}>
              <Box sx={{ color: '#fbbf24', display: 'flex' }}>
                <Icon icon="mdi:alert-outline" width={13} />
              </Box>
              <Typography sx={{ fontSize: '0.79rem', color: 'rgba(255,255,255,0.7)' }}>
                You are below your own average here too ({(hole.you.score * 100).toFixed(0)}% over{' '}
                {hole.you.games} games) — their weakness is discounted by yours.
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

/**
 * One prepared continuation.
 *
 * The point of the block is the novelty marker: everything above it is a line
 * they know, and the marked move is where they stop knowing it. Their moves are
 * shown with the frequency behind them rather than as assertions — a 36% reply
 * and a 100% reply are different objects and must not look alike.
 */
function PreparedLineBlock({
  line,
  startPly,
  master,
}: {
  line: PreparedLine;
  startPly: number;
  master: MasterContext;
}) {
  if (line.moves.length === 0) return null;
  const yours = line.moves.find(m => m.side === 'you');
  const view = yours ? master.byFen.get(yours.fen) : undefined;

  return (
    <Box
      sx={{
        borderLeft: '1px solid rgba(255,255,255,0.10)',
        pl: 1.25,
        py: 0.25,
      }}
    >
      <Stack direction="row" alignItems="baseline" spacing={0.75} sx={{ mb: 0.4 }}>
        <Typography
          sx={{
            fontFamily: MONO,
            fontSize: '0.66rem',
            fontWeight: 700,
            color: 'rgba(255,255,255,0.5)',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {Math.round(line.probability * 100)}%
        </Typography>
        <FieldLabel color="rgba(255,255,255,0.3)" size="0.52rem">
          of the time
        </FieldLabel>
      </Stack>

      <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: 0.5 }}>
        {line.moves.map((m, i) => (
          <MoveChip
            key={i}
            move={m}
            ply={startPly + i}
            novelty={line.noveltyIndex === i}
          />
        ))}
      </Box>

      <Typography sx={{ fontSize: '0.71rem', color: 'rgba(255,255,255,0.42)', mt: 0.75, lineHeight: 1.5 }}>
        {endNote(line)}
      </Typography>

      {view && yours && <MasterNote view={view} yourMove={yours.san} />}
    </Box>
  );
}

/**
 * What masters do in the position where you first have a choice.
 *
 * The headline is agreement or disagreement, because that is the part that
 * changes what you play. Everything else is counted context: the plans below
 * are moves that were made in this position, not a description of it.
 */
function MasterNote({ view, yourMove }: { view: MasterView; yourMove: string }) {
  const mine = view.yourMove;
  const top = view.choices[0];
  const agrees = mine?.rank === 1;
  const unplayed = mine?.rank === null;

  return (
    <Box sx={{ mt: 1, pt: 0.9, borderTop: '1px dashed rgba(255,255,255,0.08)' }}>
      <Stack direction="row" spacing={0.6} alignItems="center" sx={{ mb: 0.5 }}>
        <Box sx={{ color: 'rgba(255,255,255,0.35)', display: 'flex' }}>
          <Icon icon="mdi:chess-king" width={12} />
        </Box>
        <FieldLabel color="rgba(255,255,255,0.35)" size="0.52rem">
          {view.games.toLocaleString()} master games here
        </FieldLabel>
      </Stack>

      <Typography sx={{ fontSize: '0.76rem', color: 'rgba(255,255,255,0.68)', lineHeight: 1.5 }}>
        {unplayed ? (
          <>
            No master in the corpus has played{' '}
            <Box component="span" sx={{ fontFamily: MONO, color: '#fbbf24' }}>
              {yourMove}
            </Box>{' '}
            here — they play{' '}
            <Box component="span" sx={{ fontFamily: MONO, color: 'rgba(255,255,255,0.9)' }}>
              {top?.san}
            </Box>
            .
          </>
        ) : agrees ? (
          <>
            Masters agree:{' '}
            <Box component="span" sx={{ fontFamily: MONO, color: CONFIRMED }}>
              {yourMove}
            </Box>{' '}
            is their main move ({Math.round((mine?.share ?? 0) * 100)}%).
          </>
        ) : (
          <>
            Masters prefer{' '}
            <Box component="span" sx={{ fontFamily: MONO, color: EMBER_LIGHT }}>
              {top?.san}
            </Box>{' '}
            ({Math.round((top?.share ?? 0) * 100)}%, scoring{' '}
            {Math.round((top?.score ?? 0) * 100)}%);{' '}
            <Box component="span" sx={{ fontFamily: MONO }}>
              {yourMove}
            </Box>{' '}
            is their #{mine?.rank}, {shareText(mine?.share ?? 0, mine?.games ?? 0)}.
          </>
        )}
      </Typography>

      {view.motifs.length > 0 && (
        <Typography sx={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.45)', mt: 0.5, lineHeight: 1.5 }}>
          {view.principalGames.toLocaleString()} follow{' '}
          <Box component="span" sx={{ fontFamily: MONO, color: 'rgba(255,255,255,0.62)' }}>
            {view.principal.join(' ')}
          </Box>
          {' — '}
          {describeMotifs(view)}
        </Typography>
      )}
    </Box>
  );
}

/**
 * A share, or a count when the share would round to nothing.
 *
 * "their #9 at 0%" reads as a rounding artefact and makes the reader distrust
 * the row. Three games in 1,419 is the same fact stated so it can be believed.
 */
function shareText(share: number, games: number): string {
  const pct = Math.round(share * 100);
  if (pct >= 1) return `played in ${pct}%`;
  return `played in ${games.toLocaleString()} of them`;
}

/** The plans in the master line, as a sentence built from counted facts. */
function describeMotifs(view: MasterView): string {
  const parts: string[] = [];
  const castle = view.motifs.find(m => m.kind === 'castle');
  if (castle && castle.kind === 'castle') {
    parts.push(`${castle.by === 'you' ? 'you' : 'they'} castle ${castle.side}`);
  }
  const breaks = view.motifs.filter(m => m.kind === 'break');
  if (breaks.length > 0) {
    parts.push(
      `break with ${breaks
        .slice(0, 2)
        .map(b => (b.kind === 'break' ? b.san : ''))
        .join(' and ')}`
    );
  }
  const routes = view.motifs.filter(m => m.kind === 'route').slice(0, 2);
  for (const r of routes) {
    if (r.kind === 'route') parts.push(`${r.piece} to ${r.to}`);
  }
  const trade = view.motifs.find(m => m.kind === 'trade');
  if (trade && trade.kind === 'trade') parts.push(`trade on ${trade.square}`);

  return parts.length > 0 ? parts.join(', ') + '.' : 'no clear plan in the data.';
}

function MoveChip({ move, ply, novelty }: { move: PreparedMove; ply: number; novelty: boolean }) {
  const yours = move.side === 'you';
  const number = ply % 2 === 0 ? `${ply / 2 + 1}.` : '';

  const detail = yours
    ? move.from > 0
      ? `You. They have met this ${move.timesFaced} time${move.timesFaced === 1 ? '' : 's'} in ${move.from} games here.` +
        (move.gainOverCommon
          ? ` ${move.gainOverCommon}cp better than the ${move.commonReply} they usually see.`
          : '')
      : 'You.'
    : `They play this in ${Math.round((move.probability ?? 0) * 100)}% of ${move.from} games here.` +
      (move.alternatives?.length
        ? ` Otherwise ${move.alternatives
            .map(a => `${a.san} ${Math.round(a.probability * 100)}%`)
            .join(', ')}.`
        : '');

  return (
    <Tooltip arrow title={detail}>
      <Box
        component="span"
        sx={{
          fontFamily: MONO,
          fontSize: '0.78rem',
          cursor: 'help',
          px: novelty ? 0.75 : 0,
          py: novelty ? 0.25 : 0,
          borderRadius: novelty ? '4px' : 0,
          bgcolor: novelty ? 'rgba(249,115,22,0.16)' : 'transparent',
          border: novelty ? `1px solid rgba(249,115,22,0.5)` : 'none',
          color: yours ? EMBER_LIGHT : 'rgba(255,255,255,0.7)',
          fontWeight: yours ? 700 : 400,
          whiteSpace: 'nowrap',
        }}
      >
        {number}
        {move.san}
        {!yours && (move.probability ?? 0) < 0.9 && (
          <Box component="span" sx={{ color: 'rgba(255,255,255,0.35)', fontSize: '0.66rem' }}>
            {' '}
            {Math.round((move.probability ?? 0) * 100)}%
          </Box>
        )}
      </Box>
    </Tooltip>
  );
}

/** Why the line stopped, said plainly. The reason is the useful part. */
function endNote(line: PreparedLine): string {
  const last = line.noveltyIndex !== undefined ? line.moves[line.noveltyIndex] : undefined;
  switch (line.end) {
    case 'novelty':
      return last
        ? `${last.san} is new to them — met ${last.timesFaced} time${last.timesFaced === 1 ? '' : 's'} in ${last.from} games. From here they are on their own.`
        : 'From here they are on their own.';
    case 'unpredictable':
      return 'They split from here — no single reply is likely enough to prepare one line against.';
    case 'thin':
      return 'Their games run out here; too few to predict from.';
    case 'depth':
      return 'Line cut at depth.';
    case 'gameover':
      return 'The game ends here.';
    case 'noengine':
      return 'No engine answer for the next move.';
  }
}

function Stat({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: string;
}) {
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
          color: tone ?? 'rgba(255,255,255,0.9)',
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
