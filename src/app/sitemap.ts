import type { MetadataRoute } from "next";

const BASE = "https://chessmasti.com";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const routes: {
    path: string;
    changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"];
    priority: number;
  }[] = [
    { path: "/", changeFrequency: "weekly", priority: 1.0 },
    { path: "/how-it-works", changeFrequency: "monthly", priority: 0.9 },
    { path: "/architecture", changeFrequency: "monthly", priority: 0.9 },
    { path: "/vs", changeFrequency: "monthly", priority: 0.8 },
    { path: "/faq", changeFrequency: "monthly", priority: 0.8 },
    { path: "/analysis", changeFrequency: "weekly", priority: 0.7 },
    { path: "/play", changeFrequency: "weekly", priority: 0.7 },
    { path: "/practice", changeFrequency: "weekly", priority: 0.7 },
    { path: "/scout", changeFrequency: "weekly", priority: 0.7 },
    { path: "/database", changeFrequency: "weekly", priority: 0.6 },
    { path: "/openings", changeFrequency: "weekly", priority: 0.6 },
    { path: "/courses", changeFrequency: "weekly", priority: 0.5 },
    { path: "/repetit-training", changeFrequency: "weekly", priority: 0.5 },
    { path: "/internship", changeFrequency: "monthly", priority: 0.4 },
    // /feedback, /profile, /reset-password, /site-stats intentionally excluded
    // — auth-gated, internal-tooling, or not for indexing.
  ];

  return routes.map((r) => ({
    url: `${BASE}${r.path}`,
    lastModified: now,
    changeFrequency: r.changeFrequency,
    priority: r.priority,
  }));
}
