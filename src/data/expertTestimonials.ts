/**
 * Expert testimonials shown in the landing page's "Expert Testimonials"
 * section (src/pages/index.tsx).
 *
 * Each quote is reproduced verbatim from what the grandmaster said about the
 * project. Do not paraphrase, trim, or polish them: a testimonial is only
 * worth showing if it is exactly what the person said. The only editorial
 * touch is a capital letter at the start of a sentence.
 *
 * Photos are real photographs only, never generated. Drop a file under
 * public/testimonials/ and point `photo.src` at it. A testimonial without a
 * photo renders the person's initials in the same circle, so the layout
 * never depends on a file being present. When a photo comes from a licensed
 * source rather than from the person, fill in `photo.credit` and the credit
 * line renders under the section.
 */
export interface ExpertTestimonialPhotoCredit {
  /** Source name shown in the credit line, e.g. "New in Chess". */
  sourceName: string;
  /** Page the photo was taken from. */
  sourceUrl: string;
  /** Photographer or uploader, when the source names one. */
  author?: string;
  /** Licence short name, e.g. "CC BY-SA 4.0", for openly licensed photos. */
  license?: string;
  /** Licence deed URL. Required whenever `license` is set. */
  licenseUrl?: string;
}

export interface ExpertTestimonialPhoto {
  /** Site-relative path under public/, e.g. "/testimonials/alex-colovic.jpg". */
  src: string;
  /** Source credit for photos taken from a public page. Omit for photos the person supplied. */
  credit?: ExpertTestimonialPhotoCredit;
}

export interface ExpertTestimonial {
  /** Stable key for React lists and tests. */
  id: string;
  /** The quote, verbatim, without surrounding quotation marks. */
  quote: string;
  /** Display name with the title prefix, e.g. "GM Alex Colovic". */
  name: string;
  /** Credential spelled out for the caption line and screen readers. */
  title: string;
  /** Portrait, if one is on file. */
  photo?: ExpertTestimonialPhoto;
}

export const EXPERT_TESTIMONIALS: readonly ExpertTestimonial[] = [
  {
    id: "pavel-skatchkov",
    quote:
      "This project is the future of chess and of humanity as a whole. Therefore, your work is very important.",
    name: "GM Pavel Skatchkov",
    title: "Grandmaster",
    // Public biography photo, square face crop of the original.
    photo: {
      src: "/testimonials/pavel-skatchkov.jpg",
      credit: {
        sourceName: "chessok.net",
        sourceUrl:
          "https://chessok.net/article/6397-shahmatist-pavel-skachkov-biografija.html",
      },
    },
  },
  {
    id: "alex-colovic",
    quote:
      "It's commendable what you have done, providing free coaching to those who cannot afford it.",
    name: "GM Alex Colovic",
    title: "Grandmaster",
    // Public podcast promo photo, square crop with the show banner removed.
    photo: {
      src: "/testimonials/alex-colovic.jpg",
      credit: {
        sourceName: "New in Chess",
        sourceUrl:
          "https://www.newinchess.com/blog/post/nic-podcast-41-gm-alex-colovic",
      },
    },
  },
];

/**
 * Initials for the no-photo fallback: "GM Pavel Skatchkov" becomes "PS".
 * The title prefix is dropped so the circle shows the person, not the rank.
 */
export function testimonialInitials(name: string): string {
  return name
    .replace(/^(GM|IM|FM|WGM|WIM|CM|NM)\s+/, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}
