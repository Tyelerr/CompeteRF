import { RSSItem } from "../types/home.types";

// =============================================================
// RSS Feed Service
// Handles fetching & parsing the AZBilliards RSS feed.
// Swap this out if you change news sources in the future.
// =============================================================

const RSS_FEED_URL = "https://www.azbilliards.com/feed/";
const MAX_ITEMS = 10;
const DESCRIPTION_LIMIT = 200;

class RSSService {
  /**
   * Fetch and parse the RSS feed into a clean array of RSSItems.
   */
  async getLatestNews(): Promise<RSSItem[]> {
    const response = await fetch(RSS_FEED_URL);
    const xmlText = await response.text();
    return this.parseRSSFeed(xmlText);
  }

  // -------------------------------------------------------
  // Private parsing helpers
  // -------------------------------------------------------

  private parseRSSFeed(xmlText: string): RSSItem[] {
    const items: RSSItem[] = [];
    const itemMatches = xmlText.match(/<item[^>]*>([\s\S]*?)<\/item>/g);

    if (!itemMatches) return items;

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

    // Remove CDATA wrapper if present
    if (content.startsWith("<![CDATA[") && content.endsWith("]]>")) {
      content = content.slice(9, -3).trim();
    }

    return content;
  }

  private cleanText(text: string): string {
    return text
      .replace(/<[^>]*>/g, "") // Remove HTML tags
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
      const options: Intl.DateTimeFormatOptions = {
        weekday: "short",
        day: "numeric",
        month: "short",
      };
      return date.toLocaleDateString("en-US", options);
    } catch {
      return "Recent";
    }
  }
}

export const rssService = new RSSService();
