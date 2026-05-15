import { UAParser } from "ua-parser-js";

export type DeviceType = "mobile" | "tablet" | "desktop" | "unknown";

const MAX_USER_AGENT_LENGTH = 1000;

export function truncateUserAgent(userAgent: string): string {
  return userAgent.length > MAX_USER_AGENT_LENGTH
    ? userAgent.slice(0, MAX_USER_AGENT_LENGTH)
    : userAgent;
}

export function detectDevice(userAgent: string | null | undefined): DeviceType {
  if (userAgent == null || !userAgent.trim()) {
    return "unknown";
  }

  const ua = truncateUserAgent(userAgent);
  const parser = new UAParser(ua);
  const device = parser.getDevice().type;

  if (device === "tablet") {
    return "tablet";
  }
  if (device === "mobile") {
    return "mobile";
  }
  if (device === "console" || device === "smarttv" || device === "wearable") {
    return "desktop";
  }

  const os = parser.getOS().name?.toLowerCase() ?? "";
  const browser = parser.getBrowser().name;

  if (browser || os) {
    return "desktop";
  }

  return "unknown";
}
