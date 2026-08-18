/**
 * COPPA constant for the age-affirmation gate (TRK-6).
 *
 * COPPA is a US/FTC regime covering under-13s. Signup requires an explicit
 * 13+ affirmation (checkbox); no age or birth date is collected. The old
 * DOB helpers (ageInYears / isUnderCoppaAge) left with the DOB screen.
 *
 * ⚠️ Mechanics, not compliance. This posture needs qualified legal review.
 * See TRACKING_PLAN.md §4.1.
 */

export const COPPA_MIN_AGE = 13;
