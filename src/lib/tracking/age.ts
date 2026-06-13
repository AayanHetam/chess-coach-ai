/**
 * Age helpers for the neutral age gate (TRK-6, COPPA).
 *
 * COPPA is a US/FTC regime covering under-13s. The age gate collects a date of
 * birth; under-13 accounts go into a restricted mode (no behavioral analytics /
 * no conversation retention) unless verifiable parental consent is obtained.
 *
 * ⚠️ These are mechanics, not compliance. The actual restricted-mode
 * enforcement + parental-consent flow + this whole posture need qualified legal
 * review before relying on them. See TRACKING_PLAN.md §4.1.
 */

export const COPPA_MIN_AGE = 13;

/** Whole years between birthDate and `now`. */
export function ageInYears(birthDate: Date, now: Date): number {
  let age = now.getFullYear() - birthDate.getFullYear();
  const monthDiff = now.getMonth() - birthDate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birthDate.getDate())) {
    age -= 1;
  }
  return age;
}

/** True when the person is younger than the COPPA threshold (13). */
export function isUnderCoppaAge(birthDate: Date, now: Date): boolean {
  return ageInYears(birthDate, now) < COPPA_MIN_AGE;
}
