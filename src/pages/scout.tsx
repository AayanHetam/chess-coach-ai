import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  FormControl,
  Grid,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Slider,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from '@mui/material';
import { ThemeProvider } from '@mui/material/styles';
import Head from 'next/head';
import { Icon } from '@iconify/react';
import { useAtomValue } from 'jotai';
import { pieceSetAtom } from '@/components/board/states';
import { useScreenSize } from '@/hooks/useScreenSize';
import { PageTitle } from '@/components/pageTitle';
import { chessMastiDarkTheme } from '@/theme/chessMasti';
import { GradientBackdrop } from '@/components/ui/GradientBackdrop';
import { NavPill } from '@/components/ui/NavPill';
import {
  OpeningTreeNode,
  Platform,
  ProfileSnapshot,
  ScoutAnalytics,
  ScoutGame,
  ScoutResult,
  TimeClass,
} from '@/types/scout';
import { getTreeNodeAtPath } from '@/lib/scoutService';
import type {
  ScoutWorkerRequest,
  ScoutWorkerResponse,
} from '@/workers/scoutWorker';
import AnalyzingModal, { AnalyzingStage } from '@/components/scout/AnalyzingModal';
import ScoutLanding from '@/components/scout/ScoutLanding';
import ProfileCard from '@/components/scout/ProfileCard';
import TellsCard from '@/components/scout/TellsCard';
import ClockWindowsPanel from '@/components/scout/ClockWindowsPanel';
import { FieldLabel } from '@/components/scout/dossier';
import {
  availableFormats,
  scopeGames,
  type FormatScope,
} from '@/lib/scout/formatScope';
import HeadToHeadPanel from '@/components/scout/HeadToHeadPanel';
import PrepLinesPanel from '@/components/scout/PrepLinesPanel';
import { useHoleReport } from '@/lib/scout/useHoleReport';
import TargetedPrepPanel from '@/components/scout/TargetedPrep';
import PreGameChecklist from '@/components/scout/PreGameChecklist';
import RivalsPanel from '@/components/scout/RivalsPanel';
import PsychologyPanel from '@/components/scout/PsychologyPanel';
import TreeExplorer from '@/components/scout/TreeExplorer';
import TwinBotDialog from '@/components/scout/TwinBotDialog';
import TwinBotGame from '@/components/scout/TwinBotGame';
import NoveltyPanel from '@/components/scout/NoveltyPanel';
import CollisionPanel from '@/components/scout/CollisionPanel';
import ShareCardDialog from '@/components/scout/ShareCardDialog';
import { parsePlatformCode } from '@/lib/shareCard';
import { buildOpeningTree } from '@/lib/scoutService';
import { computeCollisions } from '@/lib/collisionAnalysis';
import { computeAnalytics } from '@/lib/scoutAnalytics';
import {
  buildHeadToHead,
  buildRatingSeries,
  compareProfiles,
} from '@/lib/scout/headToHead';
import { useViewer } from '@/hooks/useViewer';
import type { Collisions } from '@/types/scout';
import { getAuthHeader } from '@/lib/auth/getAuthHeader';

// ─── Search bar ─────────────────────────────────────────────────────────────

interface SearchBarProps {
  username: string;
  yourUsername: string;
  platform: Platform;
  months: number;
  loading: boolean;
  onUsernameChange: (v: string) => void;
  onYourUsernameChange: (v: string) => void;
  onPlatformChange: (p: Platform) => void;
  onMonthsChange: (m: number) => void;
  onSubmit: () => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
}

function ScoutSearchBar({
  username,
  yourUsername,
  platform,
  months,
  loading,
  onUsernameChange,
  onYourUsernameChange,
  onPlatformChange,
  onMonthsChange,
  onSubmit,
  inputRef,
}: SearchBarProps) {
  const [showCompare, setShowCompare] = useState(yourUsername.length > 0);
  return (
    <Paper
      elevation={0}
      sx={{
        p: { xs: 1.25, sm: 1.5 },
        borderRadius: 999,
        background: 'rgba(20,22,28,0.55)',
        backdropFilter: 'blur(14px) saturate(140%)',
        WebkitBackdropFilter: 'blur(14px) saturate(140%)',
        border: '1px solid rgba(255,255,255,0.08)',
        display: 'flex',
        flexWrap: { xs: 'wrap', md: 'nowrap' },
        alignItems: 'center',
        gap: 1.25,
        boxShadow: '0 8px 32px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.06)',
        overflow: 'hidden',
      }}
    >
      <ToggleButtonGroup
        value={platform}
        exclusive
        size="small"
        onChange={(_, v) => v && onPlatformChange(v)}
        sx={{
          '& .MuiToggleButton-root': {
            border: 'none',
            textTransform: 'none',
            fontWeight: 700,
            fontSize: '0.78rem',
            px: 1.5,
            borderRadius: 999,
            color: 'rgba(255,255,255,0.62)',
          },
          '& .Mui-selected': {
            bgcolor: 'rgba(249,115,22,0.18) !important',
            color: '#FB923C !important',
            border: '1px solid rgba(249,115,22,0.4)',
          },
        }}
      >
        <ToggleButton value="chess.com">
          <Icon icon="mdi:chess-pawn" width={14} style={{ marginRight: 4 }} />
          Chess.com
        </ToggleButton>
        <ToggleButton value="lichess">
          <Icon icon="mdi:chess-king" width={14} style={{ marginRight: 4 }} />
          Lichess
        </ToggleButton>
      </ToggleButtonGroup>

      <Box sx={{ height: 28, width: '1px', bgcolor: 'divider', display: { xs: 'none', md: 'block' } }} />

      <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', gap: 1, minWidth: 240 }}>
        <Icon icon="mdi:magnify" width={20} style={{ color: 'rgba(255,255,255,0.5)' }} />
        <TextField
          inputRef={inputRef}
          fullWidth
          variant="standard"
          placeholder="Enter opponent username…"
          value={username}
          onChange={e => onUsernameChange(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') onSubmit();
          }}
          InputProps={{
            disableUnderline: true,
            sx: {
              fontSize: '0.95rem',
              fontWeight: 600,
              color: 'rgba(255,255,255,0.94)',
              '& input::placeholder': { color: 'rgba(255,255,255,0.5)', opacity: 1 },
            },
          }}
        />

        {showCompare ? (
          <>
            <Typography
              sx={{
                color: 'text.secondary',
                fontWeight: 800,
                fontSize: '0.72rem',
                letterSpacing: 1.5,
                px: 0.5,
                flexShrink: 0,
              }}
            >
              VS
            </Typography>
            <TextField
              fullWidth
              variant="standard"
              placeholder="Your username"
              value={yourUsername}
              onChange={e => onYourUsernameChange(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') onSubmit();
              }}
              InputProps={{
                disableUnderline: true,
                sx: {
                  fontSize: '0.9rem',
                  fontWeight: 600,
                  color: '#FB923C',
                  '& input::placeholder': { color: 'rgba(255,255,255,0.5)', opacity: 1 },
                },
              }}
              sx={{ maxWidth: 170 }}
            />
            <Tooltip title="Remove compare">
              <Box
                component="button"
                onClick={() => {
                  setShowCompare(false);
                  onYourUsernameChange('');
                }}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 22,
                  height: 22,
                  borderRadius: '50%',
                  border: 'none',
                  bgcolor: 'rgba(255,255,255,0.06)',
                  color: 'text.secondary',
                  cursor: 'pointer',
                  flexShrink: 0,
                  '&:hover': { bgcolor: 'rgba(249,115,22,0.18)', color: '#FB923C' },
                }}
              >
                <Icon icon="mdi:close" width={14} />
              </Box>
            </Tooltip>
          </>
        ) : (
          <Tooltip title="Compare your games against theirs (collision mode)">
            <Chip
              size="small"
              icon={<Icon icon="mdi:plus" width={14} />}
              label="You"
              onClick={() => setShowCompare(true)}
              sx={{
                fontWeight: 700,
                fontSize: '0.72rem',
                bgcolor: 'rgba(249,115,22,0.18)',
                color: '#FB923C',
                border: '1px solid rgba(249,115,22,0.4)',
                cursor: 'pointer',
                '& .MuiChip-icon': { color: '#FB923C' },
                '&:hover': { bgcolor: 'rgba(249,115,22,0.28)' },
              }}
            />
          </Tooltip>
        )}
      </Box>

      <FormControl size="small" variant="standard" sx={{ minWidth: 110 }}>
        <InputLabel sx={{ fontSize: '0.7rem', color: 'text.secondary' }}>Window</InputLabel>
        <Select
          value={months}
          disableUnderline
          onChange={e => onMonthsChange(Number(e.target.value))}
          sx={{
            fontSize: '0.85rem',
            fontWeight: 600,
            color: 'rgba(255,255,255,0.94)',
            '& .MuiSelect-icon': { color: 'rgba(255,255,255,0.62)' },
          }}
          MenuProps={{
            PaperProps: {
              sx: {
                background: 'rgba(20,22,28,0.92)',
                backdropFilter: 'blur(20px)',
                WebkitBackdropFilter: 'blur(20px)',
                border: '1px solid rgba(255,255,255,0.08)',
                '& .MuiMenuItem-root': {
                  '&:hover': { bgcolor: 'rgba(249,115,22,0.12)' },
                  '&.Mui-selected': {
                    bgcolor: 'rgba(249,115,22,0.12)',
                    '&:hover': { bgcolor: 'rgba(249,115,22,0.18)' },
                  },
                },
              },
            },
          }}
        >
          <MenuItem value={3}>3 months</MenuItem>
          <MenuItem value={6}>6 months</MenuItem>
          <MenuItem value={12}>1 year</MenuItem>
          <MenuItem value={24}>2 years</MenuItem>
        </Select>
      </FormControl>

      <Button
        variant="contained"
        size="large"
        disabled={loading || !username.trim()}
        onClick={onSubmit}
        startIcon={loading ? <CircularProgress size={16} sx={{ color: '#0A0A0A' }} /> : <Icon icon="mdi:binoculars" />}
        sx={{
          borderRadius: 999,
          px: 3,
          py: 1,
          fontWeight: 800,
          letterSpacing: 0.5,
          textTransform: 'uppercase',
          fontSize: '0.82rem',
          bgcolor: '#F97316',
          color: '#0A0A0A',
          boxShadow: '0 6px 18px rgba(249,115,22,0.32)',
          '&:hover': {
            bgcolor: '#FB923C',
            boxShadow: '0 6px 18px rgba(249,115,22,0.32)',
          },
          '&.Mui-disabled': {
            bgcolor: 'rgba(255,255,255,0.06)',
            color: 'rgba(255,255,255,0.3)',
          },
        }}
      >
        {loading ? 'Scouting…' : 'Scout'}
      </Button>
    </Paper>
  );
}

// ─── Format filter ──────────────────────────────────────────────────────────

function FormatFilterBar({
  value,
  formats,
  totalGames,
  scopedGames,
  onChange,
}: {
  value: FormatScope;
  formats: Array<{ tc: TimeClass; games: number }>;
  totalGames: number;
  scopedGames: number;
  onChange: (v: FormatScope) => void;
}) {
  const options: Array<{ key: FormatScope; label: string; games: number }> = [
    { key: 'all', label: 'All formats', games: totalGames },
    ...formats.map(f => ({ key: f.tc, label: f.tc, games: f.games })),
  ];

  return (
    <Stack
      direction="row"
      alignItems="center"
      spacing={1.5}
      sx={{ flexWrap: 'wrap', gap: 1, px: 0.5 }}
    >
      <FieldLabel color="rgba(255,255,255,0.38)" size="0.57rem">
        Scope
      </FieldLabel>
      <Stack direction="row" spacing={0.75} sx={{ flexWrap: 'wrap', gap: 0.75 }}>
        {options.map(o => {
          const selected = o.key === value;
          return (
            <Box
              key={o.key}
              component="button"
              onClick={() => onChange(o.key)}
              sx={{
                px: 1.25,
                py: 0.5,
                borderRadius: '5px',
                cursor: 'pointer',
                border: selected
                  ? '1px solid rgba(249,115,22,0.5)'
                  : '1px solid rgba(255,255,255,0.1)',
                bgcolor: selected ? 'rgba(249,115,22,0.14)' : 'rgba(255,255,255,0.03)',
                transition: 'all 160ms ease',
                '&:hover': { borderColor: 'rgba(249,115,22,0.4)' },
              }}
            >
              <Stack direction="row" spacing={0.75} alignItems="center">
                <FieldLabel
                  color={selected ? '#FB923C' : 'rgba(255,255,255,0.6)'}
                  size="0.58rem"
                >
                  {o.label}
                </FieldLabel>
                <Typography
                  sx={{
                    fontFamily: "'SF Mono', Menlo, monospace",
                    fontSize: '0.6rem',
                    color: selected ? 'rgba(251,146,60,0.75)' : 'rgba(255,255,255,0.3)',
                  }}
                >
                  {o.games}
                </Typography>
              </Stack>
            </Box>
          );
        })}
      </Stack>
      {value !== 'all' && (
        <FieldLabel color="rgba(255,255,255,0.34)" size="0.55rem">
          Every number below is from these {scopedGames} games
        </FieldLabel>
      )}
    </Stack>
  );
}

// ─── Twin banner ────────────────────────────────────────────────────────────

function TwinBanner({
  username,
  totalGames,
  onPlay,
}: {
  username: string;
  totalGames: number;
  onPlay: () => void;
}) {
  return (
    <Paper
      elevation={0}
      sx={{
        p: { xs: 2, sm: 2.5 },
        borderRadius: 3,
        background: 'linear-gradient(135deg, rgba(249,115,22,0.08), rgba(20,22,28,0.6))',
        backdropFilter: 'blur(14px) saturate(140%)',
        WebkitBackdropFilter: 'blur(14px) saturate(140%)',
        border: '1px solid rgba(255,255,255,0.08)',
        boxShadow: '0 8px 32px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.06)',
        color: 'rgba(255,255,255,0.94)',
        display: 'flex',
        flexDirection: { xs: 'column', sm: 'row' },
        alignItems: { xs: 'flex-start', sm: 'center' },
        justifyContent: 'space-between',
        gap: 2,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <Box
        sx={{
          position: 'absolute',
          right: -60,
          top: -60,
          width: 220,
          height: 220,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(34,197,94,0.25) 0%, transparent 65%)',
          pointerEvents: 'none',
        }}
      />
      <Stack direction="row" spacing={2} alignItems="center">
        <Box
          sx={{
            width: 48,
            height: 48,
            borderRadius: '50%',
            background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
            flexShrink: 0,
          }}
        >
          <Icon icon="mdi:robot-outline" width={26} />
        </Box>
        <Box>
          <Stack direction="row" spacing={1} alignItems="center">
            <Typography sx={{ fontWeight: 800, fontSize: '1.05rem' }}>
              Play against <Box component="span" sx={{ color: '#22c55e' }}>{username}&apos;s</Box> Twin
            </Typography>
            <Chip
              label="NEW"
              size="small"
              sx={{
                bgcolor: 'rgba(34,197,94,0.2)',
                color: '#22c55e',
                fontWeight: 800,
                fontSize: '0.6rem',
                height: 18,
                letterSpacing: 1,
              }}
            />
          </Stack>
          <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.65)' }}>
            Bot plays their exact opening theory, then Maia-proxy at their phase-ELO.
          </Typography>
        </Box>
      </Stack>
      <Stack direction="row" spacing={2} alignItems="center">
        <Box sx={{ textAlign: 'right', display: { xs: 'none', md: 'block' } }}>
          <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.68rem', letterSpacing: 1, fontWeight: 700 }}>
            REPERTOIRE LOADED
          </Typography>
          <Typography sx={{ color: '#22c55e', fontWeight: 800, fontSize: '0.9rem', lineHeight: 1 }}>
            {totalGames.toLocaleString()} games analyzed
          </Typography>
        </Box>
        <Button
          variant="outlined"
          onClick={onPlay}
          startIcon={<Icon icon="mdi:play-circle-outline" />}
          sx={{
            borderRadius: 999,
            textTransform: 'none',
            fontWeight: 700,
            px: 2.5,
            bgcolor: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.12)',
            color: 'rgba(255,255,255,0.94)',
            '&:hover': {
              bgcolor: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(249,115,22,0.4)',
            },
          }}
        >
          Practice bot
        </Button>
      </Stack>
    </Paper>
  );
}

// ─── Page ───────────────────────────────────────────────────────────────────

export default function ScoutPage() {
  const { profile: viewerProfile } = useViewer();
  const pieceSet = useAtomValue(pieceSetAtom);
  const screenSize = useScreenSize();
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Search inputs
  const [username, setUsername] = useState('');
  const [yourUsername, setYourUsername] = useState('');
  const [platform, setPlatform] = useState<Platform>('chess.com');
  const [months, setMonths] = useState(12);

  // Results
  const [scoutResult, setScoutResult] = useState<ScoutResult | null>(null);
  const [tree, setTree] = useState<OpeningTreeNode | null>(null);
  const [analytics, setAnalytics] = useState<ScoutAnalytics | null>(null);

  // Twin Bot state
  const [twinDialogOpen, setTwinDialogOpen] = useState(false);
  const [twinGame, setTwinGame] = useState<{
    tree: OpeningTreeNode;
    color: 'white' | 'black';
  } | null>(null);

  // Share card dialog
  const [shareOpen, setShareOpen] = useState(false);
  // Set by handleShareClick after POST /api/scouts resolves. While null,
  // share URLs in the dialog fall back to ?u=&p= (still works, just doesn't
  // carry the point-in-time snapshot).
  const [scoutSnapshotId, setScoutSnapshotId] = useState<string | null>(null);

  // You-vs-them comparison
  const [collisions, setCollisions] = useState<Collisions | null>(null);
  // Your own profile, derived from the games already fetched for collisions —
  // a rating you actually played to, rather than one you typed in.
  const [yourProfile, setYourProfile] = useState<ProfileSnapshot | null>(null);
  // The collision fetch already pulls your archive; it was being discarded
  // after computing a profile. The prep report needs the games themselves to
  // compare the two of you in the same position.
  const [yourGames, setYourGames] = useState<ScoutGame[] | null>(null);
  const [collisionsLoading, setCollisionsLoading] = useState(false);
  const [collisionsError, setCollisionsError] = useState<string | null>(null);

  // Tree drill-down state
  const [colorFilter, setColorFilter] = useState<'white' | 'black'>('white');
  // Which time class the whole dossier is scoped to. A blitz scouting report
  // should not be diluted by their rapid games.
  const [formatFilter, setFormatFilter] = useState<FormatScope>('all');
  const [minGames, setMinGames] = useState(1);
  const [currentPath, setCurrentPath] = useState<string[]>([]);
  const [history, setHistory] = useState<string[][]>([]);
  const [future, setFuture] = useState<string[][]>([]);

  // Progress / modal state
  const [loading, setLoading] = useState(false);
  const [building, setBuilding] = useState(false);
  const [stage, setStage] = useState<AnalyzingStage>('connect');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // Worker
  const workerRef = useRef<Worker | null>(null);
  const pendingRef = useRef<Map<number, (r: ScoutWorkerResponse) => void>>(new Map());
  const nextReqIdRef = useRef(1);

  // Guards the drill-down rebuild effect from racing against the initial search.
  const searchInFlightRef = useRef(false);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof Worker === 'undefined') return;
    const worker = new Worker(new URL('../workers/scoutWorker.ts', import.meta.url));
    worker.onmessage = (e: MessageEvent<ScoutWorkerResponse>) => {
      const resolver = pendingRef.current.get(e.data.id);
      if (resolver) {
        pendingRef.current.delete(e.data.id);
        resolver(e.data);
      }
    };
    workerRef.current = worker;
    return () => {
      worker.terminate();
      workerRef.current = null;
      pendingRef.current.clear();
    };
  }, []);

  const runBuild = useCallback(
    (
      games: ScoutGame[],
      targetUsername: string,
      color: 'white' | 'black',
      mg: number,
      withAnalytics: boolean
    ): Promise<ScoutWorkerResponse> => {
      return new Promise((resolve, reject) => {
        const w = workerRef.current;
        const id = nextReqIdRef.current++;
        const req: ScoutWorkerRequest = {
          id,
          games,
          targetUsername,
          colorFilter: color,
          minGames: mg,
          computeAnalytics: withAnalytics,
        };
        if (!w) {
          // Fallback: import on main thread.
          Promise.all([import('@/lib/scoutService'), import('@/lib/scoutAnalytics')])
            .then(([{ buildOpeningTree, generatePrepLines }, { computeAnalytics }]) => {
              const tree = buildOpeningTree(games, targetUsername, color, 25, mg);
              const prepLines = generatePrepLines(tree, 10, Math.max(2, mg));
              const analytics = withAnalytics ? computeAnalytics(games, targetUsername) : null;
              resolve({ id, tree, prepLines, analytics, buildMs: 0 });
            })
            .catch(reject);
          return;
        }
        pendingRef.current.set(id, resolve);
        w.postMessage(req);
      });
    },
    []
  );

  const formatOptions = useMemo(
    () => (scoutResult ? availableFormats(scoutResult.games) : []),
    [scoutResult]
  );

  const activeGames = useMemo(
    () => (scoutResult ? scopeGames(scoutResult.games, formatFilter) : []),
    [scoutResult, formatFilter]
  );

  // "Customize vs me" — the prep report. Kept out of the main analytics pass
  // because it costs ~100 cloud-eval calls, so it runs only when asked for.
  const [prepColor, setPrepColor] = useState<'white' | 'black'>('white');
  const holeReport = useHoleReport();

  // Derived nodes
  const currentNode = useMemo(() => {
    if (!tree) return null;
    return getTreeNodeAtPath(tree, currentPath) || tree;
  }, [tree, currentPath]);

  const boardOrientation = useMemo<'white' | 'black'>(() => colorFilter, [colorFilter]);

  const boardSize = useMemo(() => {
    const w = screenSize.width || 800;
    const h = screenSize.height || 600;
    if (w < 900) return Math.min(w - 32, 400);
    return Math.min(380, h * 0.6);
  }, [screenSize]);

  // ── Animated progress ticker while loading ──────────────────────────────
  useEffect(() => {
    if (!loading) return;
    const id = setInterval(() => {
      setProgress(p => {
        const target = stage === 'connect' ? 0.35 : stage === 'download' ? 0.65 : 0.95;
        if (p >= target) return p;
        return Math.min(target, p + 0.02);
      });
    }, 120);
    return () => clearInterval(id);
  }, [loading, stage]);

  const focusSearch = useCallback(() => {
    searchInputRef.current?.focus();
    searchInputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, []);

  const handleSearch = useCallback(async () => {
    const name = username.trim();
    if (!name) return;
    searchInFlightRef.current = true;
    setLoading(true);
    setError(null);
    setScoutResult(null);
    setTree(null);
    setAnalytics(null);
    setCurrentPath([]);
    setHistory([]);
    setFuture([]);
    setStage('connect');
    setProgress(0.05);

    try {
      const res = await fetch('/api/scout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await getAuthHeader()) },
        body: JSON.stringify({ username: name, platform, months }),
      });

      setStage('download');
      setProgress(p => Math.max(p, 0.4));

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to fetch games');
      }

      setStage('analyze');
      setProgress(p => Math.max(p, 0.7));
      setBuilding(true);

      // First pass: compute the full analytics bundle once.
      const built = await runBuild(
        data.games,
        name,
        colorFilter,
        minGames,
        /* withAnalytics */ true
      );
      setTree(built.tree);
      setAnalytics(built.analytics);
      setBuilding(false);
      // Only commit the scout result once the tree is ready, so the rebuild
      // effect doesn't race against us. The effect will consume the in-flight
      // flag on its next run.
      setScoutResult(data);

      setProgress(1);
      // Brief pause so the 100% tick is visible.
      setTimeout(() => setLoading(false), 250);
    } catch (err: any) {
      setError(err?.message || 'Failed to scout player');
      setBuilding(false);
      setLoading(false);
      searchInFlightRef.current = false;
    }
  }, [username, platform, months, colorFilter, minGames, runBuild]);

  // ── Auto-scout from share-link query params (?u=...&p=chesscom|lichess) ──
  // Two-step: (1) seed state from the URL, (2) once `username`/`platform`
  // state reflects the URL, call handleSearch. Splitting prevents the closure
  // bug where calling handleSearch right after setState reads stale values.
  const router = useRouter();
  const autoScoutPendingRef = useRef(false);
  const autoScoutDoneRef = useRef(false);
  useEffect(() => {
    if (!router.isReady || autoScoutPendingRef.current || autoScoutDoneRef.current) return;
    const qu = router.query.u;
    const qp = router.query.p;
    const sharedUsername = Array.isArray(qu) ? qu[0] : qu;
    const sharedPlatformCode = Array.isArray(qp) ? qp[0] : qp;
    if (!sharedUsername) return;
    const parsedPlatform = parsePlatformCode(sharedPlatformCode);
    if (!parsedPlatform) return;
    autoScoutPendingRef.current = true;
    setUsername(sharedUsername);
    setPlatform(parsedPlatform);
  }, [router.isReady, router.query.u, router.query.p]);
  useEffect(() => {
    if (!autoScoutPendingRef.current || autoScoutDoneRef.current) return;
    const qu = router.query.u;
    const expected = Array.isArray(qu) ? qu[0] : qu;
    if (!expected || username !== expected) return;
    autoScoutDoneRef.current = true;
    autoScoutPendingRef.current = false;
    handleSearch();
  }, [username, platform, handleSearch, router.query.u]);

  // ── Snapshot permalink loader (?scoutId=) ────────────────────────────────
  // Takes precedence over the ?u=&p= auto-scout. Fetches the saved snapshot
  // and hydrates all the page state directly — skips the worker rebuild and
  // the chess.com / Lichess refetch entirely. Recipients see the exact
  // point-in-time view the sharer saw.
  const snapshotLoadedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!router.isReady) return;
    const qsid = router.query.scoutId;
    const sid = Array.isArray(qsid) ? qsid[0] : qsid;
    if (!sid || typeof sid !== 'string') return;
    if (snapshotLoadedRef.current === sid) return;
    snapshotLoadedRef.current = sid;
    // Mark the legacy auto-scout as "done" so it doesn't also fire.
    autoScoutDoneRef.current = true;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/scouts/${encodeURIComponent(sid)}`);
        if (!res.ok) return; // 404 / 500 — fall through to bare /scout page
        const snap = await res.json();
        if (cancelled) return;
        setUsername(String(snap.username ?? ''));
        setPlatform(snap.platform === 'lichess' ? 'lichess' : 'chess.com');
        setMonths(typeof snap.months === 'number' ? snap.months : 12);
        if (snap.yourUsername) setYourUsername(String(snap.yourUsername));
        if (snap.scoutResult) setScoutResult(snap.scoutResult);
        if (snap.tree) setTree(snap.tree);
        if (snap.analytics) setAnalytics(snap.analytics);
        if (snap.collisions !== undefined) setCollisions(snap.collisions);
      } catch (err) {
        console.error('Failed to load scout snapshot:', err);
      }
    })();
    return () => {
      cancelled = true;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.isReady, router.query.scoutId]);

  // ── Share-click handler: POST snapshot, open dialog, swap URLs ──────────
  // We open the dialog immediately for UX, then POST in parallel; the
  // snapshotId state propagates into ShareCardDialog as a prop and upgrades
  // the share URLs once the POST resolves. If POST fails, dialog still
  // works — URLs fall back to ?u=&p=.
  const handleShareClick = useCallback(() => {
    setScoutSnapshotId(null);
    setShareOpen(true);
    if (!scoutResult || !analytics || !tree) return;
    (async () => {
      try {
        const res = await fetch('/api/scouts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            username: scoutResult.username,
            platform: scoutResult.platform,
            months,
            yourUsername: yourUsername.trim() || null,
            scoutResult,
            analytics,
            tree,
            collisions,
          }),
          credentials: 'same-origin',
        });
        if (!res.ok) return;
        const json = await res.json();
        if (typeof json?.id === 'string') {
          setScoutSnapshotId(json.id);
        }
      } catch (err) {
        console.warn('Scout snapshot POST failed; share URL falls back to ?u=&p=:', err);
      }
    })();
  }, [scoutResult, analytics, tree, months, yourUsername, collisions]);

  // Collisions: fetch YOUR games (debounced) & compute vs target.
  useEffect(() => {
    if (!scoutResult) {
      setCollisions(null);
      setCollisionsError(null);
      return;
    }
    const yn = yourUsername.trim();
    if (!yn) {
      setCollisions(null);
      setCollisionsError(null);
      setYourProfile(null);
      setYourGames(null);
      return;
    }
    if (yn.toLowerCase() === scoutResult.username.toLowerCase()) {
      setCollisions(null);
      setCollisionsError("Can't compare yourself to yourself 🙂");
      return;
    }
    let cancelled = false;
    setCollisionsError(null);
    const t = setTimeout(async () => {
      setCollisionsLoading(true);
      try {
        const res = await fetch('/api/scout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(await getAuthHeader()) },
          body: JSON.stringify({
            username: yn,
            platform: scoutResult.platform,
            months: 12,
          }),
        });
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setCollisionsError(data.error || 'Failed to load your games');
          setCollisions(null);
          return;
        }
        const result = computeCollisions(
          data.games,
          yn,
          scoutResult.games,
          scoutResult.username
        );
        setCollisions(result);
        // Same payload also gives us your side of the head-to-head, and the
        // games behind the prep comparison.
        setYourGames(data.games ?? null);
        try {
          setYourProfile(computeAnalytics(data.games, yn).profile);
        } catch {
          setYourProfile(null);
        }
      } catch (e: any) {
        if (cancelled) return;
        setCollisionsError(e?.message || 'Failed to load your games');
      } finally {
        if (!cancelled) setCollisionsLoading(false);
      }
    }, 700);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [scoutResult, yourUsername]);

  // Head-to-head. Prefer a rating you actually played to; fall back to the
  // self-reported one on the profile, and label it as such so the odds are not
  // read as harder evidence than they are.
  const headToHead = useMemo(() => {
    if (!analytics) return null;
    const playedRatings = Object.values(yourProfile?.ratings ?? {}).filter(
      (r): r is number => typeof r === 'number' && r > 0
    );
    const played = playedRatings.length ? Math.max(...playedRatings) : undefined;
    const selfReported = viewerProfile?.selfReportedRating;
    const rating = played ?? selfReported;
    if (!rating) return null;
    return buildHeadToHead({
      yourRating: rating,
      yourRatingSource: played ? 'played' : 'self-reported',
      theirProfile: analytics.profile,
    });
  }, [analytics, yourProfile, viewerProfile]);

  const theirRatingSeries = useMemo(
    () => (scoutResult ? buildRatingSeries(activeGames, scoutResult.username) : []),
    [scoutResult, activeGames]
  );

  // Rebuild tree when color filter or minGames changes — analytics stay cached.
  useEffect(() => {
    if (!scoutResult) return;
    // First effect run after a fresh search is owned by handleSearch; skip it.
    if (searchInFlightRef.current) {
      searchInFlightRef.current = false;
      return;
    }
    let cancelled = false;
    setBuilding(true);
    // Analytics must be recomputed here, not reused: scoping to a format
    // changes every number on the page, not just the opening tree.
    runBuild(activeGames, scoutResult.username, colorFilter, minGames, true)
      .then(({ tree: openingTree, analytics: rebuilt }) => {
        if (cancelled) return;
        setTree(openingTree);
        if (rebuilt) setAnalytics(rebuilt);
        setCurrentPath(prev => {
          let node: OpeningTreeNode | null = openingTree;
          const valid: string[] = [];
          for (const mv of prev) {
            const child: OpeningTreeNode | undefined = node?.children.find(c => c.move === mv);
            if (!child) break;
            valid.push(mv);
            node = child;
          }
          return valid.length === prev.length ? prev : valid;
        });
        setHistory([]);
        setFuture([]);
      })
      .finally(() => {
        if (!cancelled) setBuilding(false);
      });
    return () => {
      cancelled = true;
    };
  }, [colorFilter, scoutResult, minGames, formatFilter, activeGames, runBuild]);

  // Navigation callbacks
  const navigateTo = useCallback((newPath: string[]) => {
    setCurrentPath(prev => {
      if (prev.length === newPath.length && prev.every((m, i) => m === newPath[i])) {
        return prev;
      }
      setHistory(h => [...h, prev]);
      setFuture([]);
      return newPath;
    });
  }, []);

  const handleMoveClick = useCallback(
    (move: string) => navigateTo([...currentPath, move]),
    [currentPath, navigateTo]
  );
  const handleBack = useCallback(() => {
    setHistory(h => {
      if (h.length === 0) return h;
      const prev = h[h.length - 1];
      setFuture(f => [...f, currentPath]);
      setCurrentPath(prev);
      return h.slice(0, -1);
    });
  }, [currentPath]);
  const handleForward = useCallback(() => {
    setFuture(f => {
      if (f.length === 0) return f;
      const next = f[f.length - 1];
      setHistory(h => [...h, currentPath]);
      setCurrentPath(next);
      return f.slice(0, -1);
    });
  }, [currentPath]);
  const handleReset = useCallback(() => navigateTo([]), [navigateTo]);
  const handleBreadcrumb = useCallback(
    (index: number) => navigateTo(index < 0 ? [] : currentPath.slice(0, index + 1)),
    [currentPath, navigateTo]
  );

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || target?.isContentEditable) return;
      if (e.key === 'ArrowLeft') { e.preventDefault(); handleBack(); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); handleForward(); }
      else if (e.key === 'Home') { e.preventDefault(); handleReset(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handleBack, handleForward, handleReset]);

  // Exploration from weakness/strength cards — automatically switch to the right color
  // (weaknesses as white = opponent's black tree, so target color stays whatever they play).
  const exploreLine = useCallback(
    (moves: string[], asColor: 'white' | 'black') => {
      // "as White" tab shows the *opponent's* Black lines → we need the tree filtered on
      // target (opponent) as Black.
      const targetColor = asColor === 'white' ? 'black' : 'white';
      if (colorFilter !== targetColor) setColorFilter(targetColor);
      navigateTo(moves);
      // Scroll into view
      setTimeout(() => {
        document.getElementById('scout-tree-explorer')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 150);
    },
    [colorFilter, navigateTo]
  );

  const hasResult = !!scoutResult && !!tree;

  return (
    <ThemeProvider theme={chessMastiDarkTheme}>
      <PageTitle title="Chess Masti AI - Scout" />
      <Head>
        <meta name="color-scheme" content="dark" />
        <meta name="theme-color" content="#08090C" />
        <style>{`html,body{background-color:#08090C;color-scheme:dark;margin:0;}::-webkit-scrollbar{width:10px;height:10px;}::-webkit-scrollbar-track{background:#08090C;}::-webkit-scrollbar-thumb{background:rgba(249,115,22,0.18);border-radius:5px;}`}</style>
      </Head>

      <GradientBackdrop />

      <Box
        sx={{
          minHeight: '100vh',
          color: 'rgba(255,255,255,0.94)',
          pt: 2,
          pb: 4,
          px: { xs: 2, md: 3 },
        }}
      >
        <NavPill active="scout" />

        <Box sx={{ maxWidth: 1400, mx: 'auto', mt: 2 }}>
          {/* Sticky search header */}
      <Box
        sx={{
          position: 'sticky',
          top: 0,
          zIndex: 20,
          py: 1.25,
          backdropFilter: 'blur(14px) saturate(140%)',
          WebkitBackdropFilter: 'blur(14px) saturate(140%)',
          bgcolor: 'rgba(8,9,12,0.72)',
          borderBottom: scoutResult ? '1px solid rgba(255,255,255,0.08)' : 'none',
          mb: 2,
        }}
      >
        <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 1.5, px: 0.5 }}>
          <Box
            sx={{
              width: 34,
              height: 34,
              borderRadius: 2,
              background: 'linear-gradient(135deg, #F97316 0%, #FB923C 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fff',
            }}
          >
            <Icon icon="mdi:binoculars" width={20} />
          </Box>
          <Box sx={{ flex: 1 }}>
            <Typography sx={{ fontWeight: 800, fontSize: '1.05rem', lineHeight: 1, color: 'rgba(255,255,255,0.94)' }}>
              Scout
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
              Opponent dossiers · Chess.com + Lichess
            </Typography>
          </Box>
        </Stack>
        <ScoutSearchBar
          username={username}
          yourUsername={yourUsername}
          platform={platform}
          months={months}
          loading={loading}
          onUsernameChange={setUsername}
          onYourUsernameChange={setYourUsername}
          onPlatformChange={setPlatform}
          onMonthsChange={setMonths}
          onSubmit={handleSearch}
          inputRef={searchInputRef}
        />
      </Box>

      {error && (
        <Alert
          severity="error"
          sx={{
            mb: 2,
            borderRadius: '12px',
            background: 'rgba(239,68,68,0.12)',
            border: '1px solid rgba(239,68,68,0.35)',
            color: 'rgba(255,255,255,0.94)',
            '& .MuiAlert-icon': { color: '#ef4444' },
          }}
          onClose={() => setError(null)}
        >
          {error}
        </Alert>
      )}

      {/* Result summary chips */}
      {scoutResult && (
        <Stack direction="row" spacing={1} sx={{ mb: 2, flexWrap: 'wrap', gap: 1 }}>
          <Chip
            icon={<Icon icon="mdi:account" />}
            label={`${scoutResult.username} · ${scoutResult.platform}`}
            variant="outlined"
            sx={{ borderColor: 'rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.62)' }}
          />
          <Chip
            icon={<Icon icon="mdi:chess-pawn" />}
            label={`${scoutResult.totalGames} games`}
            variant="outlined"
            sx={{ borderColor: 'rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.62)' }}
          />
          {scoutResult.cached && (
            <Tooltip title="Served from server cache (10-min TTL)">
              <Chip
                icon={<Icon icon="mdi:lightning-bolt" />}
                label="cached"
                size="small"
                sx={{ fontWeight: 700, bgcolor: 'rgba(249,115,22,0.18)', color: '#FB923C' }}
              />
            </Tooltip>
          )}
          {scoutResult.totalGames < 50 && (
            <Chip
              icon={<Icon icon="mdi:alert" />}
              label="Limited data — results may be less reliable"
              variant="outlined"
              sx={{
                bgcolor: 'rgba(245,158,11,0.14)',
                border: '1px solid rgba(245,158,11,0.4)',
                color: '#f59e0b',
              }}
            />
          )}
          {building && tree && (
            <Chip
              icon={<CircularProgress size={12} sx={{ color: '#FB923C' }} />}
              label="Rebuilding…"
              size="small"
              variant="outlined"
              sx={{ borderColor: '#FB923C', color: '#FB923C' }}
            />
          )}
        </Stack>
      )}

      {/* Empty / landing state */}
      {!hasResult && !loading && (
        <ScoutLanding onFocusSearch={focusSearch} />
      )}

      {/* Dashboard */}
      {hasResult && analytics && scoutResult && (
        <Stack spacing={2.5}>
          {formatOptions.length > 1 && (
            <FormatFilterBar
              value={formatFilter}
              formats={formatOptions}
              totalGames={scoutResult.games.length}
              scopedGames={activeGames.length}
              onChange={setFormatFilter}
            />
          )}

          <Grid container spacing={2} alignItems="stretch">
            <Grid size={{ xs: 12, lg: 6 }} sx={{ display: 'flex' }}>
              <ProfileCard
                username={scoutResult.username}
                platform={scoutResult.platform}
                profile={analytics.profile}
                onShare={handleShareClick}
              />
            </Grid>
            <Grid size={{ xs: 12, lg: 6 }} sx={{ display: 'flex' }}>
              <TellsCard tells={analytics.tells} />
            </Grid>
          </Grid>

          <ClockWindowsPanel
            windows={analytics.clockWindows}
            username={scoutResult.username}
          />

          {headToHead && yourProfile && (
            <HeadToHeadPanel
              h2h={headToHead}
              comparison={compareProfiles(yourProfile, analytics.profile)}
              series={theirRatingSeries}
              yourName={yourUsername.trim() || 'You'}
              theirName={scoutResult.username}
            />
          )}

          <PrepLinesPanel
            report={holeReport.report}
            progress={holeReport.progress}
            error={holeReport.error}
            theirName={scoutResult.username}
            yourColor={prepColor}
            onColorChange={c => {
              setPrepColor(c);
              holeReport.reset();
            }}
            onRun={() =>
              holeReport.run(activeGames, scoutResult.username, prepColor, {
                yourGames: yourGames ?? undefined,
                yourUsername: yourUsername.trim() || undefined,
              })
            }
            onExplore={(moves, asColor) => exploreLine(moves, asColor)}
          />

          <TwinBanner
            username={scoutResult.username}
            totalGames={scoutResult.totalGames}
            onPlay={() => setTwinDialogOpen(true)}
          />

          {/* You-vs-them collisions (only when yourUsername provided) */}
          {collisionsError && yourUsername.trim() && (
            <Alert
              severity="warning"
              sx={{
                borderRadius: '12px',
                background: 'rgba(245,158,11,0.12)',
                border: '1px solid rgba(245,158,11,0.35)',
                color: 'rgba(255,255,255,0.94)',
                '& .MuiAlert-icon': { color: '#f59e0b' },
              }}
              onClose={() => setCollisionsError(null)}
            >
              {collisionsError}
            </Alert>
          )}
          {collisionsLoading && (
            <Paper
              elevation={0}
              sx={{
                p: 2,
                borderRadius: '1rem',
                background: 'rgba(20,22,28,0.55)',
                backdropFilter: 'blur(14px) saturate(140%)',
                WebkitBackdropFilter: 'blur(14px) saturate(140%)',
                border: '1px solid rgba(255,255,255,0.08)',
                boxShadow: '0 8px 32px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.06)',
                display: 'flex',
                alignItems: 'center',
                gap: 1.5,
              }}
            >
              <CircularProgress size={18} sx={{ color: '#FB923C' }} />
              <Typography variant="body2" color="text.secondary">
                Loading <strong>{yourUsername}</strong>&apos;s games and computing collisions…
              </Typography>
            </Paper>
          )}
          {collisions && !collisionsLoading && (
            <CollisionPanel
              collisions={collisions}
              targetUsername={scoutResult.username}
              // yourColor = the color YOU play in the clicked line.
              // exploreLine expects the color you're playing; it flips internally
              // to walk the target's tree of the opposite color.
              onExplore={(moves, yourColor) => exploreLine(moves, yourColor)}
            />
          )}

          <TargetedPrepPanel
            prep={analytics.prep}
            onExplore={(moves, asColor) => exploreLine(moves, asColor)}
          />

          <PreGameChecklist items={analytics.checklist} />

          <Grid container spacing={2} alignItems="stretch">
            <Grid size={{ xs: 12, md: 6 }} sx={{ display: 'flex' }}>
              <RivalsPanel rivals={analytics.rivals} />
            </Grid>
            <Grid size={{ xs: 12, md: 6 }} sx={{ display: 'flex' }}>
              <PsychologyPanel
                psychology={analytics.psychology}
                recentBuckets={analytics.recentBuckets}
              />
            </Grid>
          </Grid>

          {/* Novelty / deviation finder */}
          {analytics.novelty.length > 0 && (
            <NoveltyPanel
              findings={analytics.novelty}
              onExplore={(moves, targetColor) => {
                const yourColor: 'white' | 'black' =
                  targetColor === 'white' ? 'black' : 'white';
                exploreLine(moves, yourColor);
              }}
            />
          )}

          {/* Deep-dive tree explorer */}
          <Box id="scout-tree-explorer">
            <Paper
              elevation={0}
              sx={{
                p: 2,
                borderRadius: '1.5rem',
                background: 'rgba(20,22,28,0.55)',
                backdropFilter: 'blur(14px) saturate(140%)',
                WebkitBackdropFilter: 'blur(14px) saturate(140%)',
                border: '1px solid rgba(255,255,255,0.08)',
                boxShadow: '0 8px 32px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.06)',
                overflow: 'hidden',
                mb: 2,
              }}
            >
              <Stack
                direction={{ xs: 'column', md: 'row' }}
                spacing={2}
                alignItems={{ xs: 'flex-start', md: 'center' }}
                justifyContent="space-between"
              >
                <Stack direction="row" spacing={1} alignItems="center">
                  <Icon icon="mdi:file-tree" width={20} style={{ color: '#FB923C' }} />
                  <Typography sx={{ fontWeight: 800, fontSize: '1rem', color: 'rgba(255,255,255,0.94)' }}>
                    Deep-dive Opening Tree
                  </Typography>
                  <Tooltip
                    title="Drill into the target's repertoire move-by-move. Use ← / → keys."
                    arrow
                  >
                    <Box sx={{ color: 'rgba(255,255,255,0.5)', display: 'flex', cursor: 'help' }}>
                      <Icon icon="mdi:help-circle-outline" width={14} />
                    </Box>
                  </Tooltip>
                </Stack>

                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems={{ xs: 'flex-start', sm: 'center' }}>
                  <ToggleButtonGroup
                    value={colorFilter}
                    exclusive
                    size="small"
                    onChange={(_, v) => v && setColorFilter(v)}
                    sx={{
                      '& .MuiToggleButton-root': {
                        color: 'rgba(255,255,255,0.62)',
                        border: '1px solid rgba(255,255,255,0.08)',
                      },
                      '& .Mui-selected': {
                        bgcolor: 'rgba(249,115,22,0.18) !important',
                        color: '#FB923C !important',
                        border: '1px solid rgba(249,115,22,0.4) !important',
                      },
                    }}
                  >
                    <ToggleButton value="white" sx={{ textTransform: 'none', px: 2 }}>
                      <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: '#fff', border: '1px solid #999', mr: 0.75 }} /> As White
                    </ToggleButton>
                    <ToggleButton value="black" sx={{ textTransform: 'none', px: 2 }}>
                      <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: '#3a3a3a', border: '1px solid rgba(255,255,255,0.2)', mr: 0.75 }} /> As Black
                    </ToggleButton>
                  </ToggleButtonGroup>

                  <Box sx={{ minWidth: 220 }}>
                    <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, display: 'block', mb: 0.25 }}>
                      Min games: <strong style={{ color: '#FB923C' }}>{minGames}</strong>
                    </Typography>
                    <Slider
                      size="small"
                      value={minGames}
                      onChange={(_, v) => setMinGames(Array.isArray(v) ? v[0] : v)}
                      min={1}
                      max={10}
                      step={1}
                      marks={[
                        { value: 1, label: '1' },
                        { value: 5, label: '5' },
                        { value: 10, label: '10' },
                      ]}
                      sx={{
                        color: '#FB923C',
                        '& .MuiSlider-rail': { opacity: 1, bgcolor: 'rgba(255,255,255,0.12)' },
                        '& .MuiSlider-markLabel': { color: 'rgba(255,255,255,0.5)' },
                      }}
                    />
                  </Box>
                </Stack>
              </Stack>
            </Paper>

            {tree && (
              <TreeExplorer
                tree={tree}
                currentPath={currentPath}
                orientation={boardOrientation}
                pieceSet={pieceSet}
                boardSize={boardSize}
                minGames={minGames}
                historyLen={history.length}
                futureLen={future.length}
                onMoveClick={handleMoveClick}
                onBack={handleBack}
                onForward={handleForward}
                onReset={handleReset}
                onBreadcrumbClick={handleBreadcrumb}
              />
            )}

            {!currentNode?.children.length && tree && (
              <Box sx={{ textAlign: 'center', color: 'text.secondary', mt: 1 }}>
                <Typography variant="caption">
                  End of line. Use ← to go back or Home to reset.
                </Typography>
              </Box>
            )}
          </Box>
        </Stack>
      )}

      {/* Analyzing modal */}
      <AnalyzingModal
        open={loading}
        username={username}
        platform={platform}
        stage={stage}
        progress={progress}
        onCancel={() => {
          setLoading(false);
          setBuilding(false);
        }}
      />

      {/* Twin Bot launch dialog */}
      {scoutResult && analytics && (
        <TwinBotDialog
          open={twinDialogOpen}
          onClose={() => setTwinDialogOpen(false)}
          username={scoutResult.username}
          platform={scoutResult.platform}
          profile={analytics.profile}
          onStart={userColor => {
            // Build the opponent's tree for THEIR color (opposite of user's choice).
            const oppColor: 'white' | 'black' = userColor === 'white' ? 'black' : 'white';
            const opponentTree = buildOpeningTree(
              scoutResult.games,
              scoutResult.username,
              oppColor,
              25,
              1
            );
            setTwinGame({ tree: opponentTree, color: userColor });
            setTwinDialogOpen(false);
          }}
        />
      )}

      {/* Twin Bot game */}
      {scoutResult && analytics && twinGame && (
        <TwinBotGame
          open={!!twinGame}
          onClose={() => setTwinGame(null)}
          username={scoutResult.username}
          yourUsername={yourUsername.trim() || 'You'}
          platform={scoutResult.platform}
          profile={analytics.profile}
          opponentTree={twinGame.tree}
          yourColor={twinGame.color}
          topWeakness={
            twinGame.color === 'white'
              ? analytics.prep.asWhite.weaknesses[0]
              : analytics.prep.asBlack.weaknesses[0]
          }
          pieceSet={pieceSet}
        />
      )}

      {/* Share card dialog */}
      {scoutResult && analytics && (
        <ShareCardDialog
          open={shareOpen}
          onClose={() => setShareOpen(false)}
          data={{
            username: scoutResult.username,
            platform: scoutResult.platform,
            profile: analytics.profile,
            tells: analytics.tells,
            topOpening: topOpeningFor(analytics),
          }}
          snapshotId={scoutSnapshotId}
        />
      )}
        </Box>
      </Box>
    </ThemeProvider>
  );
}

function topOpeningFor(analytics: ScoutAnalytics): { eco: string; name: string } | undefined {
  const candidate =
    analytics.prep.asWhite.strengths[0] ||
    analytics.prep.asBlack.strengths[0] ||
    analytics.prep.asWhite.weaknesses[0] ||
    analytics.prep.asBlack.weaknesses[0];
  if (!candidate) return undefined;
  return { eco: candidate.eco, name: candidate.name };
}
