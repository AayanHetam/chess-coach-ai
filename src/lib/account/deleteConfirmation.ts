/**
 * The phrase a user types to confirm account deletion.
 *
 * Lives here, not in the route, for two reasons. Next.js only permits its own
 * known exports from a `route.ts` — exporting a constant there fails the
 * production build (and only the production build; tsc and vitest are both
 * happy with it). And the dialog and the server-side check must agree: if the
 * UI asks for one word and the route demands another, the button is dead.
 */
export const DELETE_CONFIRM_PHRASE = "DELETE";
