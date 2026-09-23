"use client";

import { Box, Stack, Typography } from "@mui/material";
import Image from "next/image";
import {
  EXPERT_TESTIMONIALS,
  testimonialInitials,
  type ExpertTestimonial,
} from "@/data/expertTestimonials";
import {
  HOME_BORDER,
  HOME_MUTED,
  HOME_SURFACE,
  HOME_TEXT,
} from "./launchTheme";

/**
 * The titled players on the project, quoted verbatim from
 * src/data/expertTestimonials.ts. A credibility signal for the adult who
 * scrolls, never a choice: one plain card per person, the quote whole (the
 * data file forbids trimming it), the person under it. Sits below the doors
 * so the first screen stays a single decision.
 */

/**
 * Title-neutral on purpose: the roster is two grandmasters and a FIDE
 * Master, and a heading that said "grandmasters" over his card would
 * overstate his title. expertTestimonials.test.ts pins this.
 */
export const TESTIMONIALS_HEADING = "What chess masters say.";

const PORTRAIT_PX = 72;

/** Round portrait, or the person's initials in the same circle without a photo. */
function Portrait({ testimonial: t }: { testimonial: ExpertTestimonial }) {
  const ring = {
    width: PORTRAIT_PX,
    height: PORTRAIT_PX,
    borderRadius: "50%",
    overflow: "hidden",
    flexShrink: 0,
    background: "#1F232C",
  } as const;
  if (t.photo) {
    return (
      <Box sx={ring}>
        <Image
          src={t.photo.src}
          alt={`Portrait of ${t.name}`}
          width={PORTRAIT_PX * 2}
          height={PORTRAIT_PX * 2}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            display: "block",
          }}
        />
      </Box>
    );
  }
  return (
    <Box
      aria-hidden
      sx={{
        ...ring,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: HOME_TEXT,
        fontWeight: 800,
        fontSize: "1.4rem",
      }}
    >
      {testimonialInitials(t.name)}
    </Box>
  );
}

export function HomeTestimonials() {
  // Photos taken from a public page carry a credit; one quiet line names
  // the sources under the cards.
  const credits = EXPERT_TESTIMONIALS.flatMap((t) =>
    t.photo?.credit ? [{ id: t.id, ...t.photo.credit }] : []
  );
  return (
    <Box
      component="section"
      id="gm-backed"
      aria-labelledby="testimonials-heading"
      sx={{ py: { xs: 6, md: 10 }, scrollMarginTop: 96 }}
    >
      <Typography
        id="testimonials-heading"
        variant="h2"
        sx={{
          textAlign: "center",
          fontSize: { xs: "1.8rem", md: "2.6rem" },
          color: HOME_TEXT,
        }}
      >
        {TESTIMONIALS_HEADING}
      </Typography>
      <Stack
        spacing={{ xs: 2, md: 3 }}
        sx={{ mt: { xs: 4, md: 6 }, maxWidth: 760, mx: "auto" }}
      >
        {EXPERT_TESTIMONIALS.map((t) => (
          <Box
            component="figure"
            key={t.id}
            sx={{
              m: 0,
              p: { xs: 3, md: 4 },
              borderRadius: "28px",
              background: HOME_SURFACE,
              border: HOME_BORDER,
            }}
          >
            <Typography
              component="blockquote"
              sx={{
                m: 0,
                fontSize: { xs: "1.1rem", md: "1.25rem" },
                lineHeight: 1.55,
                color: HOME_TEXT,
              }}
            >
              {t.quote}
            </Typography>
            <Stack
              component="figcaption"
              direction="row"
              spacing={2}
              alignItems="center"
              sx={{ mt: 3 }}
            >
              <Portrait testimonial={t} />
              <Box>
                <Typography
                  sx={{
                    fontWeight: 800,
                    fontSize: "1.05rem",
                    lineHeight: 1.2,
                    color: HOME_TEXT,
                  }}
                >
                  {t.name}
                </Typography>
                <Typography
                  sx={{ mt: 0.5, fontSize: "0.9rem", color: HOME_MUTED }}
                >
                  {t.title}
                </Typography>
              </Box>
            </Stack>
          </Box>
        ))}
      </Stack>
      {credits.length > 0 && (
        <Typography
          sx={{
            mt: 3,
            textAlign: "center",
            fontSize: "0.8rem",
            color: "rgba(255,255,255,0.4)",
          }}
        >
          Photos:{" "}
          {credits.map((c, i) => (
            <Box component="span" key={c.id}>
              {i > 0 ? ", " : ""}
              <Box
                component="a"
                href={c.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                sx={{
                  color: "inherit",
                  textDecorationColor: "rgba(255,255,255,0.3)",
                  "&:hover": { color: HOME_MUTED },
                }}
              >
                {c.sourceName}
              </Box>
            </Box>
          ))}
        </Typography>
      )}
    </Box>
  );
}
