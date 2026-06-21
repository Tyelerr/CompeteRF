import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import { supabase } from "../../lib/supabase";
import { RSSItem } from "../types/home.types";

const RSS_FEED_URL = "https://www.azbilliards.com/feed/";
const CACHE_KEY = "cached_rss_news_v1";
const MAX_ITEMS = 10;
const DESCRIPTION_LIMIT = 200;
// Direct (azbilliards) gets a longer budget; the proxies are quicker to fail over.
const FETCH_TIMEOUT_MS = 15000;
const WEB_FETCH_TIMEOUT_MS = 8000;

const CORS_PROXIES = [
  "https://corsproxy.io/?" + encodeURIComponent(RSS_FEED_URL),
  "https://api.allorigins.win/raw?url=" + encodeURIComponent(RSS_FEED_URL),
  "https://api.codetabs.com/v1/proxy?quest=" + encodeURIComponent(RSS_FEED_URL),
];

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
  // Tries several sources in order so a single blocked/slow request doesn't blank
  // the feed: native fetches the feed directly first, then falls back to the CORS
  // proxies (which fetch it server-side, bypassing device/network quirks). Web
  // uses the proxies only. The last successful result is cached and returned if
  // every source fails, so news stays available across flaky networks.
  async getLatestNews(): Promise<RSSItem[]> {
    const isNative = Platform.OS !== "web";
    const sources = isNative ? [RSS_FEED_URL, ...CORS_PROXIES] : [...CORS_PROXIES];

    const notEmpty = (items: RSSItem[]) => {
      if (items.length === 0) throw new Error("empty feed");
      return items;
    };

    // Race every source — the first one to return articles wins, so a blocked or
    // slow source never delays the others. Our own edge function (server-side,
    // no CORS) is the reliable primary; the public proxies are the fallback.
    const attempts = [
      this.fetchFromEdge().then(notEmpty),
      ...sources.map((url) =>
        this.fetchFromUrl(
          url,
          url === RSS_FEED_URL ? FETCH_TIMEOUT_MS : WEB_FETCH_TIMEOUT_MS,
        ).then(notEmpty),
      ),
    ];

    try {
      const items = await Promise.any(attempts);
      this.cacheNews(items); // fire-and-forget
      return items;
    } catch {
      // Every source failed — fall back to the last cached news so the feed stays
      // available even when the network/source is down.
      return this.getCachedNews();
    }
  }

  private async fetchFromUrl(url: string, timeoutMs: number): Promise<RSSItem[]> {
    const response = await fetchWithTimeout(url, timeoutMs);
    if (!response.ok) throw new Error("status " + response.status);
    const xmlText = await response.text();
    return this.parseRSSFeed(xmlText);
  }

  // Our Supabase edge function fetches the feed server-side (no CORS), so it
  // works reliably on web where public proxies get blocked / rate-limited.
  private async fetchFromEdge(): Promise<RSSItem[]> {
    const { data, error } = await supabase.functions.invoke("rss-feed");
    if (error) throw error;
    const xml = (data as { xml?: string })?.xml;
    if (!xml) throw new Error("no xml from edge");
    return this.parseRSSFeed(xml);
  }

  private async cacheNews(items: RSSItem[]): Promise<void> {
    try {
      await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(items));
    } catch {
      // ignore cache write failures
    }
  }

  private async getCachedNews(): Promise<RSSItem[]> {
    try {
      const raw = await AsyncStorage.getItem(CACHE_KEY);
      const parsed = raw ? (JSON.parse(raw) as RSSItem[]) : [];
      return Array.isArray(parsed) ? parsed : [];
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