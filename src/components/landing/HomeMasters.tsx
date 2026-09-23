"use client";

import {
  Box,
  Tooltip,
  Typography,
  type SxProps,
  type Theme,
} from "@mui/material";
import Image from "next/image";
import {
  EXPERT_TESTIMONIALS,
  testimonialInitials,
  type ExpertTestimonial,
} from "@/data/expertTestimonials";
import { HOME_BG, HOME_MUTED, HOME_SURFACE, HOME_TEXT } from "./launchTheme";

/**
 * The titled players on the project, as a row of faces under the start
 * button: a credibility signal for the adult who looks, never a choice, and
 * small enough that the page stays one screen. Each face opens its quote
 * on hover, focus or tap, reproduced verbatim from
 * src/data/expertTestimonials.ts (the data file forbids trimming it), with
 * the person's name and title and the photo's source where one is owed.
 */

/**
 * Title-neutral on purpose: the roster is two grandmasters and a FIDE
 * Master, and "grandmasters" would overstate his title.
 * expertTestimonials.test.ts pins this.
 */
export const MASTERS_LABEL = "Backed by chess masters";

const FACE_PX = 36;

function Face({
  testimonial: t,
  index,
}: {
  testimonial: ExpertTestimonial;
  index: number;
}) {
  return (
    <Tooltip
      arrow
      describeChild
      enterTouchDelay={0}
      leaveTouchDelay={6000}
      title={
        <Box sx={{ p: 0.5 }}>
          <Typography
            component="blockquote"
            sx={{
              m: 0,
              fontSize: "0.92rem",
              lineHeight: 1.5,
              color: HOME_TEXT,
            }}
          >
            {t.quote}
          </Typography>
          <Typography
            sx={{
              mt: 1,
              fontSize: "0.8rem",
              fontWeight: 700,
              color: HOME_TEXT,
            }}
          >
            {t.name} · {t.title}
          </Typography>
          {t.photo?.credit && (
            <Typography
              sx={{ mt: 0.25, fontSize: "0.7rem", color: HOME_MUTED }}
            >
              Photo: {t.photo.credit.sourceName}
            </Typography>
          )}
        </Box>
      }
      slotProps={{
        tooltip: {
          sx: {
            bgcolor: HOME_SURFACE,
            maxWidth: 340,
            p: 1.5,
            borderRadius: "14px",
          },
        },
        arrow: { sx: { color: HOME_SURFACE } },
      }}
    >
      <Box
        component="button"
        type="button"
        aria-label={`${t.name}, ${t.title}`}
        sx={{
          p: 0,
          ml: index === 0 ? 0 : -1,
          width: FACE_PX,
          height: FACE_PX,
          borderRadius: "50%",
          overflow: "hidden",
          border: `2px solid ${HOME_BG}`,
          background: HOME_SURFACE,
          color: HOME_TEXT,
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          position: "relative",
          zIndex: EXPERT_TESTIMONIALS.length - index,
          fontSize: "0.7rem",
          fontWeight: 800,
          transition: "transform 160ms ease",
          "&:hover, &:focus-visible": {
            zIndex: EXPERT_TESTIMONIALS.length + 1,
            transform: "translateY(-2px)",
          },
          "&:focus-visible": { outline: "2px solid #FFFFFF", outlineOffset: 2 },
        }}
      >
        {t.photo ? (
          <Image
            src={t.photo.src}
            alt=""
            width={FACE_PX * 2}
            height={FACE_PX * 2}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              display: "block",
            }}
          />
        ) : (
          testimonialInitials(t.name)
        )}
      </Box>
    </Tooltip>
  );
}

export function HomeMasters({ sx }: { sx?: SxProps<Theme> }) {
  return (
    <Box
      data-testid="home-masters"
      sx={[
        { display: "flex", alignItems: "center", gap: 1.5 },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    >
      <Box sx={{ display: "flex", alignItems: "center" }}>
        {EXPERT_TESTIMONIALS.map((t, i) => (
          <Face key={t.id} testimonial={t} index={i} />
        ))}
      </Box>
      <Typography sx={{ fontSize: "0.95rem", color: HOME_MUTED }}>
        {MASTERS_LABEL}
      </Typography>
    </Box>
  );
}
