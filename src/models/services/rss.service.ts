import { Platform } from "react-native";
import { RSSItem } from "../types/home.types";

const RSS_FEED_URL = "https://www.azbilliards.com/feed/";
const MAX_ITEMS = 10;
const DESCRIPTION_LIMIT = 200;
// Increased from 12s — Expo Go on device can be slower than simulator
const FETCH_TIMEOUT_MS = 20000;
const WEB_FETCH_TIMEOUT_MS = 8000;
// Single retry only — the feed is either reachable or not
const MAX_RETRIES = 1;
const RETRY_DELAY_MS = 2000;

const CORS_PROXIES = [
  "https://corsproxy.io/?" + encodeURIComponent(RSS_FEED_URL),
  "https://api.allorigins.win/raw?url=" + encodeURIComponent(RSS_FEED_URL),
  "https://api.codetabs.com/v1/proxy?quest=" + encodeURIComponent(RSS_FEED_URL),
];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithTimeout(url: string, timeoutMs = FETCH_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    return response;
  } finally {
    clearTimeout(id);
  }
}

class RSSService {
  async getLatestNews(): Promise<RSSItem[]> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      if (attempt > 0) await sleep(RETRY_DELAY_MS);
      try {
        const items = Platform.OS !== "web"
          ? await this.fetchNative()
          : await this.fetchWeb();
        if (items.length > 0) return items;
        if (attempt === MAX_RETRIES) return [];
        lastError = new Error("Feed returned 0 items");
      } catch (err) {
        lastError = err;
        // Downgraded to warn — RSS is non-critical content; AbortErrors
        // from slow networks are expected and should not appear as red
        // errors in the console.
        console.warn("[RSS] Attempt " + (attempt + 1) + " failed:", (err as Error)?.message ?? err);
      }
    }
    // Silently return empty rather than throwing — the home screen shows
    // a retry button when newsError is true, but this is non-critical.
    return [];
  }

  private async fetchNative(): Promise<RSSItem[]> {
    const response = await fetchWithTimeout(RSS_FEED_URL);
    if (!response.ok) throw new Error("[RSS] Native fetch status " + response.status);
    const xmlText = await response.text();
    return this.parseRSSFeed(xmlText);
  }

  private async fetchWeb(): Promise<RSSItem[]> {
    const tryProxy = async (proxyUrl: string): Promise<RSSItem[]> => {
      const response = await fetchWithTimeout(proxyUrl, WEB_FETCH_TIMEOUT_MS);
      if (!response.ok) throw new Error("Proxy status " + response.status);
      const xmlText = await response.text();
      const items = this.parseRSSFeed(xmlText);
      if (items.length === 0) throw new Error("Proxy returned 0 items");
      return items;
    };
    try {
      return await Promise.any(CORS_PROXIES.map(tryProxy));
    } catch {
      return [];
    }
  }

  private parseRSSFeed(xmlText: string): RSSItem[] {
    const items: RSSItem[] = [];
    const itemMatches = xmlText.match(/<item[^>]*>([\s\S]*?)<\/item>/g);
    if (!itemMatches) return items;
    itemMatches.slice(0, MAX_ITEMS).forEach((itemXml) => {
      const title = this.extractXMLContent(itemXml, "title");
      const description = this.extractXMLContent(itemXml, "description");
      const link = this.extractXMLContent(itemXml, "link");
      const pubDate = this.extractXMLContent(itemXml, "pubDate");
      const author = this.extractXMLContent(itemXml, "dc:creator") || "azbilliards";
      if (title && description) {
        items.push({
          title: this.cleanText(title),
          description: this.cleanText(description).substring(0, DESCRIPTION_LIMIT) + "...",
          link,
          pubDate: this.formatDate(pubDate),
          author,
        });
      }
    });
    return items;
  }

  private extractXMLContent(xml: string, tag: string): string {
    const match = xml.match(new RegExp("<" + tag + "[^>]*>([\\s\\S]*?)<\\/" + tag + ">", "i"));
    if (!match) return "";
    let content = match[1].trim();
    if (content.startsWith("<![CDATA[") && content.endsWith("]]>")) {
      content = content.slice(9, -3).trim();
    }
    return content;
  }

  private cleanText(text: string): string {
    return text
      .replace(/<[^>]*>/g, "")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, "\"")
      .replace(/&#038;/g, "&")
      .replace(/&#8220;/g, "\u201C")
      .replace(/&#8221;/g, "\u201D")
      .replace(/&#8217;/g, "\u2019")
      .replace(/&#8216;/g, "\u2018")
      .replace(/&#8230;/g, "\u2026")
      .replace(/&#(\d+);/g, (_match, dec) => String.fromCharCode(Number(dec)))
      .trim();
  }

  private formatDate(dateString: string): string {
    try {
      return new Date(dateString).toLocaleDateString("en-US", {
        weekday: "short", day: "numeric", month: "short",
      });
    } catch {
      return "Recent";
    }
  }
}

export const rssService = new RSSService();