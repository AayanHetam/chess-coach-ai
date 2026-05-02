export const TRACKS = [
  "engineering",
  "content_coaching",
  "growth",
  "research",
] as const;
export type Track = (typeof TRACKS)[number];

export const TRACK_LABELS: Record<Track, string> = {
  engineering: "Engineering",
  content_coaching: "Chess Content & Coaching",
  growth: "Growth & Community",
  research: "Research",
};

export const EDUCATION_STATUSES = [
  "high_school",
  "undergrad",
  "grad",
  "professional",
  "other",
] as const;
export type EducationStatus = (typeof EDUCATION_STATUSES)[number];

export const EDUCATION_LABELS: Record<EducationStatus, string> = {
  high_school: "High school",
  undergrad: "Undergraduate",
  grad: "Graduate",
  professional: "Professional",
  other: "Other",
};
