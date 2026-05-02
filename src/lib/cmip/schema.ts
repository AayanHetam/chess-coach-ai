import { z } from "zod";
import { TRACKS, EDUCATION_STATUSES } from "./types";

const optionalString = (max: number) =>
  z
    .string()
    .max(max)
    .optional()
    .or(z.literal(""))
    .transform((v) => (v && v.length > 0 ? v : undefined));

const optionalUrl = (max: number) =>
  z
    .string()
    .max(max)
    .optional()
    .or(z.literal(""))
    .transform((v) => (v && v.length > 0 ? v : undefined))
    .refine(
      (v) => v === undefined || /^https?:\/\/.+\..+/.test(v),
      "Must be a valid URL starting with http(s)://",
    );

export const cmipApplicationSchema = z.object({
  fullName: z.string().trim().min(2, "Please enter your full name").max(120),
  email: z.string().trim().toLowerCase().email("Please enter a valid email").max(200),
  phone: optionalString(40),
  location: z
    .string()
    .trim()
    .min(2, "Please share your location or time zone")
    .max(200),
  educationStatus: z.enum(EDUCATION_STATUSES),
  school: z.string().trim().min(1, "Please enter your school or institution").max(200),
  tracks: z
    .array(z.enum(TRACKS))
    .min(1, "Pick at least one track")
    .max(4),
  chessUsername: optionalString(80),
  chessRating: optionalString(40),
  portfolioUrl: optionalUrl(500),
  resumeUrl: optionalUrl(500),
  motivation: z
    .string()
    .trim()
    .min(100, "Tell us in at least 100 characters")
    .max(800, "Keep it under 800 characters"),
  proudOf: z
    .string()
    .trim()
    .min(100, "Tell us in at least 100 characters")
    .max(800, "Keep it under 800 characters"),
  hoursPerWeek: z.coerce
    .number()
    .int("Whole hours please")
    .min(1, "Must be at least 1")
    .max(60, "60 max"),
  earliestStartDate: z
    .string()
    .min(1, "Pick an earliest start date")
    .refine((v) => !Number.isNaN(Date.parse(v)), "Invalid date"),
  hearAbout: optionalString(300),
  acknowledgeInterview: z.literal(true, {
    message: "Please acknowledge the interview requirement",
  }),
  // honeypot — must be empty
  website: z.string().max(0).optional().or(z.literal("")),
});

export type CmipApplicationInput = z.input<typeof cmipApplicationSchema>;
export type CmipApplication = z.output<typeof cmipApplicationSchema>;
