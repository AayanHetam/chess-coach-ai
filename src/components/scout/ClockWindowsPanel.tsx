import { useEffect, useState } from 'react';
import { Box, Stack, Tooltip, Typography } from '@mui/material';
import { Icon } from '@iconify/react';
import type { ClockWindows, TimeBucket } from '@/types/scout';
import {
  DossierPanel,
  EMBER,
  EMBER_LIGHT,
  FieldLabel,
  MONO,
  VerdictPill,
  strengthColor,
} from './dossier';

export interface ClockWindowsPanelProps {
  windows: ClockWindows;
  username: string;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function hourLabel(h: number): string {
  return `${String(h).padStart(2, '0')}:00`;
}

export default function ClockWindowsPanel({ windows, username }: ClockWindowsPanelProps) {
  // The live read depends on the viewer's clock, which the server does not
  // share — compute it after mount so SSR and the client agree.
  const [nowHour, setNowHour] = useState<number | null>(null);
  useEffect(() => {
    setNowHour(new Date().getHours());
    // Re-check on the hour so a page left open doesn't go stale.
    const t = setInterval(() => setNowHour(new Date().getHours()), 60_000);
    return () => clearInterval(t);
  }, []);

  const current = nowHour === null ? undefined : windows.byHour[nowHour];
  const maxGames = Math.max(1, ...windows.byHour.map(b => b.games));

  if (windows.sampled === 0) {
    return (
      <DossierPanel label="Clock windows">
        <FieldLabel color="rgba(255,255,255,0.4)" size="0.62rem">
          No timestamped games in this window
        </FieldLabel>
      </DossierPanel>
    );
  }

  return (
    <DossierPanel
      label="Clock windows"
      action={
        <VerdictPill
          label={`${windows.sampled.toLocaleString()} timed`}
          color="rgba(255,255,255,0.45)"
        />
      }
    >
      {/* The live read — the reason this panel exists. */}
      <Box
        sx={{
          mb: 2.5,
          px: 1.75,
          py: 1.5,
          borderRadius: '10px',
          border: '1px solid rgba(249,115,22,0.3)',
          background: 'linear-gradient(120deg, rgba(249,115,22,0.1), rgba(249,115,22,0.02))',
        }}
      >
        {current === undefined ? (
          <FieldLabel color="rgba(255,255,255,0.4)" size="0.62rem">
            Checking the clock…
          </FieldLabel>
        ) : (
          <Stack direction="row" alignItems="center" spacing={1.75}>
            <Box sx={{ color: EMBER_LIGHT, display: 'flex', flexShrink: 0 }}>
              <Icon icon="mdi:clock-outline" width={22} />
            </Box>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <FieldLabel color={EMBER_LIGHT} size="0.58rem">
                Right now · {hourLabel(current.index)} your time
              </FieldLabel>
              <Typography
                sx={{
                  mt: 0.4,
                  fontSize: '0.92rem',
                  color: 'rgba(255,255,255,0.9)',
                  lineHeight: 1.35,
                }}
              >
                {current.reliable ? (
                  <>
                    At this hour {username} scores{' '}
                    <Box
                      component="span"
                      sx={{
                        fontFamily: MONO,
                        fontWeight: 700,
                        color: strengthColor(current.scorePct),
                      }}
                    >
                      {current.scorePct}%
                    </Box>{' '}
                    across {current.games} games.
                  </>
                ) : (
                  <>
                    Only {current.games} game{current.games === 1 ? '' : 's'} at this hour — not
                    enough to call.
                  </>
                )}
              </Typography>
            </Box>
          </Stack>
        )}
      </Box>

      {/* Hour histogram: bar height = how often they play, fill = how well. */}
      <Box sx={{ mb: 0.75 }}>
        <FieldLabel color="rgba(255,255,255,0.38)" size="0.57rem">
          By hour · height = games, colour = their score
        </FieldLabel>
      </Box>
      <Stack direction="row" spacing={0.4} alignItems="flex-end" sx={{ height: 76, mb: 0.75 }}>
        {windows.byHour.map(b => {
          const isNow = b.index === nowHour;
          const h = Math.max(3, (b.games / maxGames) * 68);
          const color = b.reliable ? strengthColor(b.scorePct) : 'rgba(255,255,255,0.16)';
          return (
            <Tooltip
              key={b.index}
              arrow
              placement="top"
              title={
                b.games === 0
                  ? `${hourLabel(b.index)} — no games`
                  : `${hourLabel(b.index)} — ${b.games} games${
                      b.reliable ? `, scores ${b.scorePct}%` : ' (too few to rate)'
                    }`
              }
            >
              <Box
                sx={{
                  flex: 1,
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'flex-end',
                  height: '100%',
                  cursor: 'help',
                }}
              >
                <Box
                  sx={{
                    height: h,
                    borderRadius: '2px',
                    bgcolor: color,
                    opacity: b.reliable ? 0.9 : 1,
                    outline: isNow ? `1.5px solid ${EMBER}` : 'none',
                    outlineOffset: 1,
                    transition: 'height 320ms ease, background-color 200ms ease',
                  }}
                />
              </Box>
            </Tooltip>
          );
        })}
      </Stack>
      <Stack direction="row" justifyContent="space-between" sx={{ mb: 2.25 }}>
        {[0, 6, 12, 18, 23].map(h => (
          <FieldLabel key={h} color="rgba(255,255,255,0.28)" size="0.53rem">
            {String(h).padStart(2, '0')}
          </FieldLabel>
        ))}
      </Stack>

      {/* Weekday strip */}
      <Box sx={{ mb: 0.75 }}>
        <FieldLabel color="rgba(255,255,255,0.38)" size="0.57rem">
          By day
        </FieldLabel>
      </Box>
      <Stack direction="row" spacing={0.6} sx={{ mb: 2.25 }}>
        {windows.byWeekday.map(b => (
          <Tooltip
            key={b.index}
            arrow
            title={
              b.games === 0
                ? `${WEEKDAYS[b.index]} — no games`
                : `${WEEKDAYS[b.index]} — ${b.games} games${
                    b.reliable ? `, scores ${b.scorePct}%` : ' (too few to rate)'
                  }`
            }
          >
            <Box sx={{ flex: 1, textAlign: 'center', cursor: 'help' }}>
              <Box
                sx={{
                  height: 5,
                  borderRadius: '2px',
                  mb: 0.6,
                  bgcolor: b.reliable ? strengthColor(b.scorePct) : 'rgba(255,255,255,0.14)',
                }}
              />
              <FieldLabel color="rgba(255,255,255,0.4)" size="0.53rem">
                {WEEKDAYS[b.index].slice(0, 1)}
              </FieldLabel>
            </Box>
          </Tooltip>
        ))}
      </Stack>

      {/* Callouts */}
      <Stack
        direction="row"
        spacing={2}
        sx={{ pt: 1.75, borderTop: '1px solid rgba(255,255,255,0.07)', flexWrap: 'wrap', gap: 1.5 }}
      >
        {windows.weakestHour && (
          <Callout
            icon="mdi:target"
            label="Catch them at"
            value={`${hourLabel(windows.weakestHour.index)} · ${windows.weakestHour.scorePct}%`}
            color={EMBER_LIGHT}
          />
        )}
        {windows.strongestHour && (
          <Callout
            icon="mdi:shield-outline"
            label="Avoid"
            value={`${hourLabel(windows.strongestHour.index)} · ${windows.strongestHour.scorePct}%`}
            color="rgba(255,255,255,0.66)"
          />
        )}
        {windows.busiestHour && windows.busiestHour.games > 0 && (
          <Callout
            icon="mdi:account-clock-outline"
            label="Most active"
            value={`${hourLabel(windows.busiestHour.index)} · ${windows.busiestHour.games} games`}
            color="rgba(255,255,255,0.66)"
          />
        )}
      </Stack>
    </DossierPanel>
  );
}

function Callout({
  icon,
  label,
  value,
  color,
}: {
  icon: string;
  label: string;
  value: string;
  color: string;
}) {
  return (
    <Stack direction="row" spacing={0.85} alignItems="center">
      <Box sx={{ color, display: 'flex' }}>
        <Icon icon={icon} width={13} />
      </Box>
      <Box>
        <FieldLabel color="rgba(255,255,255,0.34)" size="0.53rem">
          {label}
        </FieldLabel>
        <Typography sx={{ fontFamily: MONO, fontSize: '0.78rem', fontWeight: 700, color }}>
          {value}
        </Typography>
      </Box>
    </Stack>
  );
}

export type { TimeBucket };
