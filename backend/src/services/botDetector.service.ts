import { truncateUserAgent } from "./deviceDetector.service.js";

export type BotClassification =
  | "human"
  | "legitimate_crawler"
  | "suspicious_bot"
  | "unknown";

const LEGITIMATE_CRAWLERS = [
  "googlebot",
  "bingbot",
  "facebookexternalhit",
  "twitterbot",
  "linkedinbot",
  "slackbot",
  "whatsapp",
  "telegrambot",
  "discordbot",
  "duckduckbot",
  "baiduspider",
  "yandexbot",
  "applebot",
] as const;

const SUSPICIOUS_PATTERNS = [
  "scraper",
  "scrapy",
  "curl",
  "wget",
  "python-requests",
  "headless",
  "phantom",
  "selenium",
  "puppeteer",
] as const;

const GENERIC_BOT_KEYWORDS = ["bot", "crawler", "spider", "scraper"] as const;

function matchesPattern(haystack: string, pattern: string): boolean {
  return haystack.includes(pattern);
}

export function detectBot(userAgent: string | null | undefined): BotClassification {
  try {
    if (userAgent == null || !userAgent.trim()) {
      return "suspicious_bot";
    }

    const ua = truncateUserAgent(userAgent).toLowerCase();

    for (const pattern of LEGITIMATE_CRAWLERS) {
      if (matchesPattern(ua, pattern)) {
        return "legitimate_crawler";
      }
    }

    for (const pattern of SUSPICIOUS_PATTERNS) {
      if (matchesPattern(ua, pattern)) {
        return "suspicious_bot";
      }
    }

    for (const keyword of GENERIC_BOT_KEYWORDS) {
      if (matchesPattern(ua, keyword)) {
        return "suspicious_bot";
      }
    }

    return "human";
  } catch (err) {
    console.error("Bot detection failed:", err);
    return "unknown";
  }
}
