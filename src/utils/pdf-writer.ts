// src/utils/pdf-writer.ts
// A tiny dependency-free PDF 1.4 writer — enough for printable reports: pages, the built-in
// Helvetica / Helvetica-Bold fonts (no embedding), text, lines, rectangles and gray fills.
// Pure TypeScript (no DOM / native module), so the same bytes are produced on web, iOS and
// Android. Text is WinAnsi (Latin-1 + common punctuation); other characters are simplified
// (accents stripped) or shown as "?" — never dropped silently.

export type PdfFont = "regular" | "bold";

// Helvetica / Helvetica-Bold advance widths (1/1000 em) for ASCII 32..126 (Adobe AFM).
const HELV = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556,
  556, 556, 278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778,
  667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556,
  556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584,
];
const HELV_BOLD = [
  278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556,
  556, 556, 333, 333, 584, 584, 584, 611, 975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778,
  667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 333, 278, 333, 584, 556, 333, 556, 611, 556, 611, 556, 333, 611,
  611, 278, 278, 556, 278, 889, 611, 611, 611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584,
];

// Unicode → WinAnsi byte for the punctuation the app uses (Latin-1 0xA0–0xFF maps 1:1).
const WIN_ANSI: Record<string, number> = {
  "‘": 0x91, "’": 0x92, "“": 0x93, "”": 0x94, "•": 0x95, "–": 0x96, "—": 0x97,
  "…": 0x85, "™": 0x99, "€": 0x80, "Š": 0x8a, "š": 0x9a, "Ž": 0x8e, "ž": 0x9e,
  "Œ": 0x8c, "œ": 0x9c, "Ÿ": 0x9f, "ƒ": 0x83,
};
// Letters with no Unicode decomposition → closest Latin letter.
const TRANSLIT: Record<string, string> = { "Ł": "L", "ł": "l", "Đ": "D", "đ": "d", "ı": "i", "Ħ": "H", "ħ": "h" };

/** One WinAnsi byte per character (accents stripped where needed; "?" when impossible). */
export const toWinAnsi = (text: string): number[] => {
  const out: number[] = [];
  for (const ch of String(text ?? "")) {
    const c = ch.codePointAt(0)!;
    if (c >= 32 && c <= 126) out.push(c);
    else if (c >= 0xa0 && c <= 0xff) out.push(c);
    else if (WIN_ANSI[ch] != null) out.push(WIN_ANSI[ch]);
    else if (c === 9 || c === 10 || c === 13) out.push(32);
    else if (TRANSLIT[ch]) out.push(TRANSLIT[ch].charCodeAt(0));
    else {
      const base = ch.normalize("NFD").replace(/[̀-ͯ]/g, "");
      const b = base.codePointAt(0) ?? 63;
      out.push(base.length === 1 && b >= 32 && b <= 126 ? b : 63);
    }
  }
  return out;
};

const charWidth = (code: number, font: PdfFont): number => {
  const table = font === "bold" ? HELV_BOLD : HELV;
  if (code >= 32 && code <= 126) return table[code - 32];
  if (code === 0x95 || code === 0xb7) return 350;
  if (code === 0x96) return 556;
  if (code === 0x97) return 1000;
  if (code === 0x91 || code === 0x92) return 222;
  return 556;
};

/** Rendered width of `text` in points. */
export const textWidth = (text: string, size: number, font: PdfFont = "regular"): number =>
  (toWinAnsi(text).reduce((w, c) => w + charWidth(c, font), 0) * size) / 1000;

/** `text` shortened with "…" so it fits in `maxWidth` points. */
export const fitText = (text: string, size: number, maxWidth: number, font: PdfFont = "regular"): string => {
  const t = String(text ?? "");
  if (textWidth(t, size, font) <= maxWidth) return t;
  const chars = Array.from(t);
  let lo = 0;
  let hi = chars.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (textWidth(chars.slice(0, mid).join("").trimEnd() + "…", size, font) <= maxWidth) lo = mid;
    else hi = mid - 1;
  }
  return lo > 0 ? chars.slice(0, lo).join("").trimEnd() + "…" : "";
};

const num = (n: number) => (Math.round(n * 100) / 100).toString();

const pdfString = (text: string): string => {
  let s = "(";
  for (const b of toWinAnsi(text)) {
    if (b === 0x28 || b === 0x29 || b === 0x5c) s += "\\" + String.fromCharCode(b);
    else if (b < 32 || b > 126) s += "\\" + b.toString(8).padStart(3, "0");
    else s += String.fromCharCode(b);
  }
  return s + ")";
};

/** One page's drawing commands. Coordinates are top-left based (y grows downward). */
export class PdfPage {
  readonly ops: string[] = [];
  constructor(readonly width: number, readonly height: number) {}

  text(x: number, y: number, text: string, size: number, opts: { font?: PdfFont; gray?: number; align?: "left" | "right" | "center" } = {}) {
    const font = opts.font ?? "regular";
    const w = opts.align && opts.align !== "left" ? textWidth(text, size, font) : 0;
    const dx = opts.align === "right" ? -w : opts.align === "center" ? -w / 2 : 0;
    this.ops.push(
      `BT /${font === "bold" ? "F2" : "F1"} ${num(size)} Tf ${num(opts.gray ?? 0)} g ${num(x + dx)} ${num(this.height - y)} Td ${pdfString(text)} Tj ET`,
    );
  }

  line(x1: number, y1: number, x2: number, y2: number, opts: { width?: number; gray?: number } = {}) {
    this.ops.push(
      `${num(opts.width ?? 0.75)} w ${num(opts.gray ?? 0)} G ${num(x1)} ${num(this.height - y1)} m ${num(x2)} ${num(this.height - y2)} l S`,
    );
  }

  /** Polyline (connectors). */
  path(points: [number, number][], opts: { width?: number; gray?: number } = {}) {
    if (points.length < 2) return;
    const [first, ...rest] = points;
    this.ops.push(
      `${num(opts.width ?? 0.75)} w ${num(opts.gray ?? 0)} G ${num(first[0])} ${num(this.height - first[1])} m ` +
        rest.map(([x, y]) => `${num(x)} ${num(this.height - y)} l`).join(" ") +
        " S",
    );
  }

  rect(x: number, y: number, w: number, h: number, opts: { stroke?: number | null; fill?: number | null; width?: number } = {}) {
    const stroke = opts.stroke === undefined ? 0 : opts.stroke;
    const fill = opts.fill ?? null;
    const paint = fill != null && stroke != null ? "B" : fill != null ? "f" : "S";
    this.ops.push(
      `${num(opts.width ?? 0.75)} w ${stroke != null ? `${num(stroke)} G ` : ""}${fill != null ? `${num(fill)} g ` : ""}` +
        `${num(x)} ${num(this.height - y - h)} ${num(w)} ${num(h)} re ${paint}`,
    );
  }
}

export class PdfDocument {
  readonly pages: PdfPage[] = [];
  constructor(private readonly meta: { title?: string; author?: string } = {}) {}

  addPage(width: number, height: number): PdfPage {
    const p = new PdfPage(width, height);
    this.pages.push(p);
    return p;
  }

  /** The finished file as bytes. */
  toBytes(): Uint8Array {
    const objs: string[] = [];
    const add = (body: string) => objs.push(body) as number; // 1-based object number
    const catalog = add(""); // filled below
    const pagesObj = add("");
    const f1 = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
    const f2 = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");
    const kids: number[] = [];
    for (const p of this.pages) {
      const content = p.ops.join("\n");
      const contentObj = add(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
      kids.push(
        add(
          `<< /Type /Page /Parent ${pagesObj} 0 R /MediaBox [0 0 ${num(p.width)} ${num(p.height)}] ` +
            `/Resources << /Font << /F1 ${f1} 0 R /F2 ${f2} 0 R >> >> /Contents ${contentObj} 0 R >>`,
        ),
      );
    }
    objs[catalog - 1] = `<< /Type /Catalog /Pages ${pagesObj} 0 R >>`;
    objs[pagesObj - 1] = `<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(" ")}] /Count ${kids.length} >>`;
    const info = add(
      `<< /Title ${pdfString(this.meta.title ?? "")} /Author ${pdfString(this.meta.author ?? "")} /Producer (Compete) >>`,
    );

    let out = "%PDF-1.4\n%âãÏÓ\n";
    const offsets: number[] = [];
    objs.forEach((body, i) => {
      offsets.push(out.length);
      out += `${i + 1} 0 obj\n${body}\nendobj\n`;
    });
    const xref = out.length;
    out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
    for (const o of offsets) out += `${o.toString().padStart(10, "0")} 00000 n \n`;
    out += `trailer\n<< /Size ${objs.length + 1} /Root ${catalog} 0 R /Info ${info} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;

    // Every character above is a single byte (WinAnsi escapes are octal), so length = byte count.
    const bytes = new Uint8Array(out.length);
    for (let i = 0; i < out.length; i++) bytes[i] = out.charCodeAt(i) & 0xff;
    return bytes;
  }
}

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
/** Base64 of raw bytes (no reliance on btoa / Buffer). */
export const bytesToBase64 = (bytes: Uint8Array): string => {
  let out = "";
  let i = 0;
  for (; i + 2 < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + B64[(n >> 6) & 63] + B64[n & 63];
  }
  const rest = bytes.length - i;
  if (rest === 1) {
    const n = bytes[i] << 16;
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + "==";
  } else if (rest === 2) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8);
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + B64[(n >> 6) & 63] + "=";
  }
  return out;
};
