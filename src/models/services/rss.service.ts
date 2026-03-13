import { Platform } from "react-native";
import { RSSItem } from "../types/home.types";

const RSS_FEED_URL = "https://www.azbilliards.com/feed/";
const MAX_ITEMS = 10;
const DESCRIPTION_LIMIT = 200;

const CORS_PROXIES = [
  `https://corsproxy.io/?${encodeURIComponent(RSS_FEED_URL)}`,
  `https://api.allorigins.win/raw?url=${encodeURIComponent(RSS_FEED_URL)}`,
];

class RSSService {
  async getLatestNews(): Promise<RSSItem[]> {
    if (Platform.OS !== "web") {
      const response = await fetch(RSS_FEED_URL);
      const xmlText = await response.text();
      return this.parseRSSFeed(xmlText);
    }

    for (const proxyUrl of CORS_PROXIES) {
      try {
        console.log("[RSS] Trying proxy:", proxyUrl);
        const response = await fetch(proxyUrl);
        if (!response.ok) {
          console.warn("[RSS] Proxy returned status:", response.status);
          continue;
        }
        const xmlText = await response.text();
        console.log("[RSS] Response length:", xmlText.length);
        const items = this.parseRSSFeed(xmlText);
        console.log("[RSS] Parsed items:", items.length);
        if (items.length > 0) return items;
      } catch (err) {
        console.error("[RSS] Proxy failed:", proxyUrl, err);
      }
    }

    console.warn("[RSS] All proxies failed or returned 0 items");
    return [];
  }

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