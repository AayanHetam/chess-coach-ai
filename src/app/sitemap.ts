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
    // AEO cluster — exact-match and supporting pages
    {
      path: "/free-ai-chess-coach",
      changeFrequency: "monthly",
      priority: 0.95,
    },
    { path: "/ai-chess-coach", changeFrequency: "monthly", priority: 0.85 },
    {
      path: "/free-chess-analysis",
      changeFrequency: "monthly",
      priority: 0.85,
    },
    {
      path: "/stockfish-ai-chess-coach",
      changeFrequency: "monthly",
      priority: 0.85,
    },
    {
      path: "/decodechess-alternative",
      changeFrequency: "monthly",
      priority: 0.8,
    },
    { path: "/noctie-alternative", changeFrequency: "monthly", priority: 0.8 },
    {
      path: "/lichess-opponent-scout",
      changeFrequency: "monthly",
      priority: 0.85,
    },
    {
      path: "/mistake-based-chess-puzzles",
      changeFrequency: "monthly",
      priority: 0.85,
    },
    // July content cluster — listicles, comparison guides, how-tos
    {
      path: "/best-free-ai-chess-coach",
      changeFrequency: "monthly",
      priority: 0.85,
    },
    {
      path: "/ai-chess-coach-vs-chess-engine",
      changeFrequency: "monthly",
      priority: 0.8,
    },
    {
      path: "/how-to-analyze-lichess-game-with-ai",
      changeFrequency: "monthly",
      priority: 0.8,
    },
    {
      path: "/how-to-analyze-chess-com-game-with-ai",
      changeFrequency: "monthly",
      priority: 0.8,
    },
    {
      path: "/why-llm-chess-coaches-hallucinate",
      changeFrequency: "monthly",
      priority: 0.75,
    },
    {
      path: "/free-chess-coach-for-beginners",
      changeFrequency: "monthly",
      priority: 0.8,
    },
    {
      path: "/ai-chess-coach-for-india",
      changeFrequency: "monthly",
      priority: 0.8,
    },
    {
      path: "/train-chess-mistakes-with-ai",
      changeFrequency: "monthly",
      priority: 0.8,
    },
    { path: "/how-it-works", changeFrequency: "monthly", priority: 0.9 },
    { path: "/architecture", changeFrequency: "monthly", priority: 0.9 },
    { path: "/vs", changeFrequency: "monthly", priority: 0.8 },
    { path: "/faq", changeFrequency: "monthly", priority: 0.8 },
    { path: "/analysis", changeFrequency: "weekly", priority: 0.7 },
    { path: "/play", changeFrequency: "weekly", priority: 0.7 },
    { path: "/practice", changeFrequency: "weekly", priority: 0.7 },
    { path: "/scout", changeFrequency: "weekly", priority: 0.7 },
    { path: "/database", changeFrequency: "weekly", priority: 0.6 },
    { path: "/courses", changeFrequency: "weekly", priority: 0.5 },
    { path: "/repetit-training", changeFrequency: "weekly", priority: 0.5 },
    { path: "/internship", changeFrequency: "monthly", priority: 0.4 },
    { path: "/extension", changeFrequency: "monthly", priority: 0.6 },
    { path: "/privacy", changeFrequency: "yearly", priority: 0.3 },
    // Puzzle rating landing pages — /puzzles/600 … /puzzles/2200, step 100.
    // Bands must match src/pages/puzzles/[rating].tsx getStaticPaths exactly.
    ...Array.from({ length: 17 }, (_, i) => ({
      path: `/puzzles/${600 + i * 100}`,
      changeFrequency: "weekly" as const,
      priority: 0.6,
    })),
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
