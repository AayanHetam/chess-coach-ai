"use server";

import { headers } from "next/headers";
import { createHash } from "node:crypto";
import { ZodError } from "zod";
import { Timestamp } from "firebase-admin/firestore";
import { getAdminFirestore, AdminConfigError } from "@/lib/server/firebaseAdmin";
import { getAuthEnv } from "@/env";
import { logErrorToSentry } from "@/lib/sentry";
import { cmipApplicationSchema } from "@/lib/cmip/schema";
import { sendApplicantConfirmation, sendAdminNotification } from "@/lib/server/cmipEmail";

export type SubmitState =
  | { status: "idle" }
  | { status: "ok" }
  | { status: "error"; error: string; fieldErrors?: Record<string, string> };

const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;

function hashIp(ip: string): string {
  return createHash("sha256").update(ip).digest("hex").slice(0, 32);
}

export async function submitApplication(
  _prev: SubmitState,
  formData: FormData,
): Promise<SubmitState> {
  const rawTracks = formData.getAll("tracks").map((v) => String(v));
  const raw = {
    fullName: formData.get("fullName"),
    email: formData.get("email"),
    phone: formData.get("phone") ?? "",
    location: formData.get("location"),
    educationStatus: formData.get("educationStatus"),
    school: formData.get("school"),
    tracks: rawTracks,
    chessUsername: formData.get("chessUsername") ?? "",
    chessRating: formData.get("chessRating") ?? "",
    portfolioUrl: formData.get("portfolioUrl") ?? "",
    resumeUrl: formData.get("resumeUrl") ?? "",
    motivation: formData.get("motivation"),
    proudOf: formData.get("proudOf"),
    hoursPerWeek: formData.get("hoursPerWeek"),
    earliestStartDate: formData.get("earliestStartDate"),
    hearAbout: formData.get("hearAbout") ?? "",
    acknowledgeInterview: formData.get("acknowledgeInterview") === "on" || formData.get("acknowledgeInterview") === "true",
    website: formData.get("website") ?? "",
  };

  let parsed;
  try {
    parsed = cmipApplicationSchema.parse(raw);
  } catch (err) {
    if (err instanceof ZodError) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of err.issues) {
        const key = String(issue.path[0] ?? "_");
        if (!fieldErrors[key]) fieldErrors[key] = issue.message;
      }
      return {
        status: "error",
        error: "Please fix the highlighted fields and try again.",
        fieldErrors,
      };
    }
    throw err;
  }

  // Honeypot — silently succeed without writing.
  if (parsed.website && parsed.website.length > 0) {
    return { status: "ok" };
  }

  const hdrs = await headers();
  const ip =
    hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    hdrs.get("x-real-ip") ||
    "unknown";
  const userAgent = hdrs.get("user-agent") ?? undefined;
  const referer = hdrs.get("referer") ?? undefined;
  const ipHash = hashIp(ip);

  let db;
  try {
    db = await getAdminFirestore();
  } catch (err) {
    if (err instanceof AdminConfigError) {
      console.error("[cmip/submit] firestore unavailable", err);
      logErrorToSentry(err, { area: "cmip-submit", phase: "firestore-init" });
      return {
        status: "error",
        error: "We can't accept applications right now. Please try again in a few minutes.",
      };
    }
    throw err;
  }

  // Rate limit: 1 submission per email per 10 min.
  try {
    const since = Timestamp.fromMillis(Date.now() - RATE_LIMIT_WINDOW_MS);
    const recent = await db
      .collection("cmip_applications")
      .where("email", "==", parsed.email)
      .where("createdAt", ">", since)
      .limit(1)
      .get();
    if (!recent.empty) {
      return {
        status: "error",
        error: "We just received an application from this email. Please wait a few minutes before resubmitting.",
      };
    }
  } catch (err) {
    // Don't block submission on rate-limit query failure — log and continue.
    console.warn("[cmip/submit] rate-limit query failed", err);
    logErrorToSentry(err, { area: "cmip-submit", phase: "rate-limit" });
  }

  const env = getAuthEnv();
  const docPayload = {
    fullName: parsed.fullName,
    email: parsed.email,
    phone: parsed.phone ?? null,
    location: parsed.location,
    educationStatus: parsed.educationStatus,
    school: parsed.school,
    tracks: parsed.tracks,
    chessUsername: parsed.chessUsername ?? null,
    chessRating: parsed.chessRating ?? null,
    portfolioUrl: parsed.portfolioUrl ?? null,
    resumeUrl: parsed.resumeUrl ?? null,
    motivation: parsed.motivation,
    proudOf: parsed.proudOf,
    hoursPerWeek: parsed.hoursPerWeek,
    earliestStartDate: parsed.earliestStartDate,
    hearAbout: parsed.hearAbout ?? null,
    acknowledgeInterview: true,
    status: "submitted" as const,
    source: referer ?? null,
    userAgent: userAgent ?? null,
    ipHash,
    createdAt: Timestamp.now(),
  };

  let docRef;
  try {
    docRef = await db.collection("cmip_applications").add(docPayload);
  } catch (err) {
    console.error("[cmip/submit] firestore write failed", err);
    logErrorToSentry(err, { area: "cmip-submit", phase: "firestore-write", email: parsed.email });
    return {
      status: "error",
      error: "Something went wrong saving your application. Please try again.",
    };
  }

  // Emails — fire both. Don't fail the submission if email fails; log to Sentry.
  const programUrl = `${env.appBaseUrl.replace(/\/$/, "")}/internship`;

  try {
    await sendApplicantConfirmation({
      to: parsed.email,
      fullName: parsed.fullName,
      programUrl,
      contactEmail: env.cmip.contactEmail,
    });
  } catch (err) {
    console.error("[cmip/submit] applicant email failed", err);
    logErrorToSentry(err, { area: "cmip-submit", phase: "applicant-email", email: parsed.email });
  }

  if (env.cmip.adminEmail) {
    const projectId = env.firebase.projectId;
    const firestoreConsoleUrl = projectId
      ? `https://console.firebase.google.com/project/${projectId}/firestore/data/~2Fcmip_applications~2F${docRef.id}`
      : undefined;
    try {
      await sendAdminNotification({
        to: env.cmip.adminEmail,
        fullName: parsed.fullName,
        email: parsed.email,
        phone: parsed.phone,
        location: parsed.location,
        educationStatus: parsed.educationStatus,
        school: parsed.school,
        tracks: parsed.tracks,
        chessUsername: parsed.chessUsername,
        chessRating: parsed.chessRating,
        portfolioUrl: parsed.portfolioUrl,
        resumeUrl: parsed.resumeUrl,
        motivation: parsed.motivation,
        proudOf: parsed.proudOf,
        hoursPerWeek: parsed.hoursPerWeek,
        earliestStartDate: parsed.earliestStartDate,
        hearAbout: parsed.hearAbout,
        source: referer,
        userAgent,
        firestoreDocPath: `cmip_applications/${docRef.id}`,
        firestoreConsoleUrl,
      });
    } catch (err) {
      console.error("[cmip/submit] admin email failed", err);
      logErrorToSentry(err, { area: "cmip-submit", phase: "admin-email" });
    }
  } else {
    console.warn("[cmip/submit] CMIP_ADMIN_EMAIL not set — admin notification skipped");
  }

  return { status: "ok" };
}
