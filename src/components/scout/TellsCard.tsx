import { Box, Stack, Tooltip, Typography } from '@mui/material';
import { Icon } from '@iconify/react';
import { TellsProfile, Predictability } from '@/types/scout';
import {
  DossierPanel,
  FieldLabel,
  MONO,
  SegmentedMeter,
  VerdictPill,
  tellColor,
} from './dossier';

export interface TellsCardProps {
  tells: TellsProfile;
}

const TELL_META: Record<
  TellsProfile['factors'][number]['id'],
  { icon: string; tip: string }
> = {
  time_trouble: {
    icon: 'mdi:clock-alert-outline',
    tip: 'How often they lose on time or grind into long flag-danger endgames.',
  },
  tilts: {
    icon: 'mdi:emoticon-confused-outline',
    tip: 'Tendency to string losses after a loss — rapid tilt spirals.',
  },
  limited_rep: {
    icon: 'mdi:book-open-variant',
    tip: 'How narrow their opening repertoire is — few first moves = predictable.',
  },
  repetitive: {
    icon: 'mdi:repeat',
    tip: 'Share of games concentrated in their top-3 first moves.',
  },
};

/** The headline verdict. Phrased as how *readable* they are, not how bad they are. */
function verdict(p: Predictability): { label: string; color: string } {
  if (p === 'High') return { label: 'Highly readable', color: '#f87171' };
  if (p === 'Medium') return { label: 'Readable', color: '#FB923C' };
  return { label: 'Hard to read', color: '#34d399' };
}

export default function TellsCard({ tells }: TellsCardProps) {
  const v = verdict(tells.predictability);
  const totalColor = tellColor(tells.total);

  // Rank so the strongest tell leads — the whole point of the panel is
  // "what do I exploit first", and that answer should not require comparing
  // four bars by eye.
  const ranked = [...tells.factors].sort((a, b) => b.score - a.score);
  const headline = ranked[0];

  return (
    <DossierPanel
      label="Tells"
      emphasis
      action={<VerdictPill label={`${ranked.length} found`} color="rgba(255,255,255,0.5)" />}
    >
      {/* Headline: the index, the verdict, and the single biggest lever. */}
      <Stack direction="row" spacing={2.5} alignItems="flex-start" sx={{ mb: 2.5 }}>
        <Box sx={{ flexShrink: 0 }}>
          <Stack direction="row" alignItems="baseline" spacing={0.25}>
            <Typography
              sx={{
                fontFamily: MONO,
                fontSize: '3rem',
                fontWeight: 700,
                lineHeight: 0.9,
                color: totalColor,
                letterSpacing: '-0.04em',
                fontVariantNumeric: 'tabular-nums',
                textShadow: `0 0 28px ${totalColor}4d`,
              }}
            >
              {tells.total}
            </Typography>
            <Typography
              sx={{
                fontFamily: MONO,
                fontSize: '0.85rem',
                fontWeight: 600,
                color: 'rgba(255,255,255,0.34)',
              }}
            >
              /100
            </Typography>
          </Stack>
        </Box>

        <Box sx={{ flex: 1, minWidth: 0, pt: 0.25 }}>
          <Typography
            sx={{
              fontWeight: 700,
              fontSize: '1rem',
              color: v.color,
              lineHeight: 1.2,
              mb: 0.75,
            }}
          >
            {v.label}
          </Typography>
          {headline && (
            <Typography
              sx={{
                fontSize: '0.82rem',
                color: 'rgba(255,255,255,0.62)',
                lineHeight: 1.45,
              }}
            >
              Biggest lever:{' '}
              <Box component="span" sx={{ color: 'rgba(255,255,255,0.92)', fontWeight: 600 }}>
                {headline.label.toLowerCase()}
              </Box>
              .
            </Typography>
          )}
        </Box>
      </Stack>

      {/* Numbered findings — the dossier's core gesture. */}
      <Stack spacing={1.5}>
        {ranked.map((tell, i) => {
          const color = tellColor(tell.score);
          return (
            <Tooltip key={tell.id} title={TELL_META[tell.id].tip} placement="left" arrow>
              <Box sx={{ cursor: 'help' }}>
                <Stack direction="row" alignItems="center" spacing={1.25} sx={{ mb: 0.6 }}>
                  <FieldLabel color="rgba(255,255,255,0.3)" size="0.6rem">
                    {String(i + 1).padStart(2, '0')}
                  </FieldLabel>
                  <Box sx={{ color, display: 'flex', flexShrink: 0 }}>
                    <Icon icon={TELL_META[tell.id].icon} width={13} />
                  </Box>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <FieldLabel color="rgba(255,255,255,0.78)" size="0.66rem">
                      {tell.label}
                    </FieldLabel>
                  </Box>
                  <Typography
                    sx={{
                      fontFamily: MONO,
                      fontSize: '0.82rem',
                      fontWeight: 700,
                      color,
                      fontVariantNumeric: 'tabular-nums',
                      flexShrink: 0,
                    }}
                  >
                    {tell.score}
                  </Typography>
                </Stack>
                <Box sx={{ pl: '26px' }}>
                  <SegmentedMeter value={tell.score} color={color} segments={24} height={9} />
                </Box>
              </Box>
            </Tooltip>
          );
        })}
      </Stack>
    </DossierPanel>
  );
}
