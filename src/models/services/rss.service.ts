import { Platform } from "react-native";
import { RSSItem } from "../types/home.types";

const RSS_FEED_URL = "https://www.azbilliards.com/feed/";
const MAX_ITEMS = 10;
const DESCRIPTION_LIMIT = 200;
// Generous timeout for VPN / slow connections
const FETCH_TIMEOUT_MS = 12_000;
// Retry config
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 1_500;

const CORS_PROXIES = [
  `https://corsproxy.io/?${encodeURIComponent(RSS_FEED_URL)}`,
  `https://api.allorigins.win/raw?url=${encodeURIComponent(RSS_FEED_URL)}`,
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Wraps fetch with an AbortController timeout so slow/VPN connections
// don't hang the UI indefinitely.
async function fetchWithTimeout(
  url: string,
  timeoutMs = FETCH_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    return response;
  } finally {
    clearTimeout(id);
  }
}

// ── Service ───────────────────────────────────────────────────────────────────

class RSSService {
  // Returns parsed items on success.
  // Throws an Error on total failure so callers can distinguish
  // "network/parse error" from "fetch succeeded but zero articles".
  async getLatestNews(): Promise<RSSItem[]> {
    let lastError: unknown;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      if (attempt > 0) {
        console.log(`[RSS] Retry attempt ${attempt}/${MAX_RETRIES} after ${RETRY_DELAY_MS}ms...`);
        await sleep(RETRY_DELAY_MS);
      }

      try {
        const items = Platform.OS !== "web"
          ? await this.fetchNative()
          : await this.fetchWeb();

        // A successful fetch that returned items — done.
        if (items.length > 0) return items;

        // Fetch succeeded but returned 0 items. Could be a transient parse
        // issue — treat as a retryable failure unless it's the last attempt,
        // in which case we return [] (genuine empty feed).
        if (attempt === MAX_RETRIES) {
          console.warn("[RSS] All attempts returned 0 items — feed may genuinely be empty.");
          return [];
        }
        lastError = new Error("Feed returned 0 items");
      } catch (err) {
        lastError = err;
        console.error(`[RSS] Attempt ${attempt + 1} failed:`, err);
      }
    }

    // All retries exhausted with errors — throw so the viewmodel can surface
    // an error state rather than silently showing an empty list.
    throw lastError ?? new Error("RSS fetch failed after all retries");
  }

  // ── Native fetch ─────────────────────────────────────────────────────────

  private async fetchNative(): Promise<RSSItem[]> {
    const response = await fetchWithTimeout(RSS_FEED_URL);
    if (!response.ok) {
      throw new Error(`[RSS] Native fetch returned status ${response.status}`);
    }
    const xmlText = await response.text();
    return this.parseRSSFeed(xmlText);
  }

  // ── Web fetch (CORS proxies) ──────────────────────────────────────────────

  private async fetchWeb(): Promise<RSSItem[]> {
    let lastProxyError: unknown;

    for (const proxyUrl of CORS_PROXIES) {
      try {
        console.log("[RSS] Trying proxy:", proxyUrl);
        const response = await fetchWithTimeout(proxyUrl);
        if (!response.ok) {
          console.warn("[RSS] Proxy returned status:", response.status);
          lastProxyError = new Error(`Proxy status ${response.status}`);
          continue;
        }
        const xmlText = await response.text();
        console.log("[RSS] Response length:", xmlText.length);
        const items = this.parseRSSFeed(xmlText);
        console.log("[RSS] Parsed items:", items.length);
        if (items.length > 0) return items;
        // Proxy responded but parser got nothing — try next proxy
        lastProxyError = new Error("Proxy returned unparseable content");
      } catch (err) {
        console.error("[RSS] Proxy failed:", proxyUrl, err);
        lastProxyError = err;
      }
    }

    console.warn("[RSS] All proxies failed or returned 0 items");
    // Throw so the retry loop in getLatestNews() can count this as a failure
    throw lastProxyError ?? new Error("All CORS proxies failed");
  }

  // ── XML parsing ───────────────────────────────────────────────────────────

  private parseRSSFeed(xmlText: string): RSSItem[] {
    const items: RSSItem[] = [];
    const itemMatches = xmlText.match(/<item[^>]*>([\s\S]*?)<\/item>/g);
    if (!itemMatches) {
      console.warn("[RSS] No <item> tags found in XML");
      return items;
    }
    itemMatches.slice(0, MAX_ITEMS).forEach((itemXml) => {
      const title = this.extractXMLContent(itemXml, "title");
      const description = this.extractXMLContent(itemXml, "description");
      const link = this.extractXMLContent(itemXml, "link");
      const pubDate = this.extractXMLContent(itemXml, "pubDate");
      const author =
        this.extractXMLContent(itemXml, "dc:creator") || "azbilliards";
      if (title && description) {
        items.push({
          title: this.cleanText(title),
          description:
            this.cleanText(description).substring(0, DESCRIPTION_LIMIT) + "...",
          link,
          pubDate: this.formatDate(pubDate),
          author,
        });
      }
    });
    return items;
  }

  private extractXMLContent(xml: string, tag: string): string {
    const match = xml.match(
      new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\/${tag}>`, "i"),
    );
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
      .replace(/&quot;/g, '"')
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
      const date = new Date(dateString);
      return date.toLocaleDateString("en-US", {
        weekday: "short",
        day: "numeric",
        month: "short",
      });
    } catch {
      return "Recent";
    }
  }
}

export const rssService = new RSSService();
