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
  /** Photographer or uploader named by the licence. */
  author: string;
  /** Licence short name, e.g. "CC BY-SA 4.0". */
  license: string;
  /** Licence deed URL. */
  licenseUrl: string;
  /** Where the original lives, e.g. the Wikimedia Commons file page. */
  sourceUrl: string;
  /** Source name shown in the credit line, e.g. "Wikimedia Commons". */
  sourceName: string;
}

export interface ExpertTestimonialPhoto {
  /** Site-relative path under public/, e.g. "/testimonials/alex-colovic.jpg". */
  src: string;
  /** Required attribution for third-party licensed photos. Omit for photos the person supplied. */
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
    // No freely licensed photograph of GM Skatchkov exists on Wikimedia
    // Commons as of 2026-09-09. Add one he supplies at
    // public/testimonials/pavel-skatchkov.jpg and set `photo` here.
  },
  {
    id: "alex-colovic",
    quote:
      "It's commendable what you have done, providing free coaching to those who cannot afford it.",
    name: "GM Alex Colovic",
    title: "Grandmaster",
    // A CC BY-SA 4.0 photograph exists on Wikimedia Commons
    // (https://commons.wikimedia.org/wiki/File:Alex_Colovic_2014.jpg), but
    // upload.wikimedia.org could not be reached from the build sandbox on
    // 2026-09-09. To enable it: save a square face crop (at least 320x320)
    // to public/testimonials/alex-colovic.jpg and uncomment this block. The
    // credit line renders under the section automatically.
    // photo: {
    //   src: "/testimonials/alex-colovic.jpg",
    //   credit: {
    //     author: "Acpstaff",
    //     license: "CC BY-SA 4.0",
    //     licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
    //     sourceUrl:
    //       "https://commons.wikimedia.org/wiki/File:Alex_Colovic_2014.jpg",
    //     sourceName: "Wikimedia Commons",
    //   },
    // },
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
