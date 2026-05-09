import type { MetadataRoute } from "next";

const PRIVATE_PATHS = ["/profile", "/reset-password", "/api/"];

export default function robots(): MetadataRoute.Robots {
  const rule = (userAgent: string) => ({
    userAgent,
    allow: "/",
    disallow: PRIVATE_PATHS,
  });

  return {
    rules: [
      rule("*"),

      // Traditional search crawlers
      rule("Googlebot"),
      rule("Bingbot"),

      // AI-assistant retrieval crawlers — explicit allow
      rule("GPTBot"),
      rule("ClaudeBot"),
      rule("PerplexityBot"),
      rule("Google-Extended"),
    ],
    sitemap: "https://chessmasti.com/sitemap.xml",
  };
}
