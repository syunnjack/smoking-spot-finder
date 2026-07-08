import type { MetadataRoute } from "next";

function resolveBaseUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
}

// ワイルドカード（*）だけでもAIクローラーは既定で許可されるが、AI検索・回答エンジン（LLMO）に
// このサイトが引用される機会を増やすため、主要なAIクローラーを個別に明示しておく。
const AI_CRAWLER_USER_AGENTS = [
  "GPTBot", // OpenAI（ChatGPT検索等の学習・参照）
  "ChatGPT-User", // ChatGPTのブラウジング機能
  "Google-Extended", // Google GeminiのAI学習（通常のGooglebotとは別枠）
  "PerplexityBot",
  "ClaudeBot", // Anthropic
  "Applebot-Extended", // Apple Intelligence / Siri
  "CCBot", // Common Crawl（多くのLLMの学習データ元）
];

export default function robots(): MetadataRoute.Robots {
  const baseUrl = resolveBaseUrl();
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
      },
      ...AI_CRAWLER_USER_AGENTS.map((userAgent) => ({
        userAgent,
        allow: "/",
      })),
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
