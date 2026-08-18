import { z } from "zod";

const sharedFields = {
  surface: z.string().max(200).optional(),
  sessionId: z.string().max(64).optional(),
  requestId: z.string().max(64).optional(),
  ts: z.string().max(40).optional(),
};

const pageViewEvent = z
  .object({
    name: z.literal("page.view"),
    props: z
      .object({
        path: z.string().max(500),
        title: z.string().max(300),
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
 * provider errors, and arbitrary future content from entering `events.props`.
 */
export function parseTrackRequestBody(value: unknown) {
  return trackRequestSchema.safeParse(value);
}
