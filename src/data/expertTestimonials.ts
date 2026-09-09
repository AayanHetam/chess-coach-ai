/**
 * Expert testimonials shown in the landing page's "Expert Testimonials"
 * section (src/pages/index.tsx).
 *
 * Each quote is reproduced verbatim from what the grandmaster said about the
 * project. Do not paraphrase, trim, or polish them: a testimonial is only
 * worth showing if it is exactly what the person said. The only editorial
 * touch is a capital letter at the start of a sentence.
 */
export interface ExpertTestimonial {
  /** Stable key for React lists and tests. */
  id: string;
  /** The quote, verbatim, without surrounding quotation marks. */
  quote: string;
  /** Display name with the title prefix, e.g. "GM Alex Colovic". */
  name: string;
  /** Credential spelled out for the caption line and screen readers. */
  title: string;
}

export const EXPERT_TESTIMONIALS: readonly ExpertTestimonial[] = [
  {
    id: "pavel-skatchkov",
    quote:
      "This project is the future of chess and of humanity as a whole. Therefore, your work is very important.",
    name: "GM Pavel Skatchkov",
    title: "Grandmaster",
  },
  {
    id: "alex-colovic",
    quote:
      "It's commendable what you have done, providing free coaching to those who cannot afford it.",
    name: "GM Alex Colovic",
    title: "Grandmaster",
  },
];
