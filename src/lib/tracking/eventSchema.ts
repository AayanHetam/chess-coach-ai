import { z } from "zod";

const safePath = z
  .string()
  .max(200)
  .regex(/^\/[A-Za-z0-9/_-]*$/, "Expected a route path without query content");

const sharedFields = {
  sessionId: z.string().uuid().optional(),
  ts: z.string().datetime({ offset: true }).optional(),
};

const pageViewEvent = z
  .object({
    name: z.literal("page.view"),
    props: z
      .object({
        path: safePath,
      })
      .strict(),
    ...sharedFields,
  })
  .strict();

const consentAcceptedEvent = z
  .object({
    name: z.literal("consent.accepted"),
    props: z.object({}).strict().optional(),
    ...sharedFields,
  })
  .strict();

const eventSchema = z.discriminatedUnion("name", [
  pageViewEvent,
  consentAcceptedEvent,
]);

const trackRequestSchema = z
  .object({ events: z.array(eventSchema).min(1).max(50) })
  .strict();

export type SupportedTrackingEvent = z.infer<typeof eventSchema>;

/**
 * Allow only currently emitted consent-controlled events. Strict nested
 * schemas prevent prompts, messages, responses, positions, game records,
 * provider errors, query strings, titles, and arbitrary future content from
 * entering any client-controlled event field.
 */
export function parseTrackRequestBody(value: unknown) {
  return trackRequestSchema.safeParse(value);
}
