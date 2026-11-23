import { createHash } from "node:crypto";

export type AtlasKind = "repo" | "web" | "image";
export type AtlasItem = {
  id: string;
  kind: AtlasKind;
  name: string;
  description: string;
  url: string | null;
  category: string;
  visibility: "public" | "private" | "unknown";
  evidence: string;
  source: Record<string, unknown>;
};

const REPO_PATTERN = /^[a-z\d_.-]+\/[a-z\d_.-]+$/i;
const MAX_TITLE = 220;
const MAX_DESCRIPTION = 4000;

function safeString(x: unknown, len: number): string {
  return typeof x === "string" ? x.replace(/[\u0000-\u001f]/g, " ").trim().slice(0, len) : "";
}
function object(x: unknown): Record<string, unknown> {
  return x && typeof x === "object" && !Array.isArray(x) ? x as Record<string, unknown> : {};
}
function canonicalUrl(s: string): string | null {
  try {
    const u = new URL(s);
    return ["http:", "https:"].includes(u.protocol) ? u.href.slice(0, 900) : null;
  } catch { return null; }
}
function idHash(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 40);
}

/** Normalize old v2/v3 Atlas records without persisting base64 image data. */
export function normalizeItem(raw: unknown, kind: AtlasKind): AtlasItem | null {
  const r = object(raw);
  let url = canonicalUrl(safeString(r.url || r.github_url || r.link, 900));
  let name = safeString(r.name || r.title || r.repo, MAX_TITLE);
  if (kind === "repo") {
    if (!REPO_PATTERN.test(name) && url) {
      const u = new URL(url);
      if (u.hostname.toLowerCase() !== "github.com") return null;
      const parts = u.pathname.split("/").filter(Boolean);
      name = parts.slice(0, 2).join("/");
    }
    if (!REPO_PATTERN.test(name)) return null;
    url = `https://github.com/${name}`;
  } else if (kind === "web") {
    if (!url) return null;
    name ||= new URL(url).hostname;
  } else {
    // Images are represented by metadata and OCR notes; raw image bytes are local-only.
    name ||= "Untitled screenshot";
    url = url || null;
  }
  const description = safeString(r.description || r.summary || r.text || r.ocrText || r.ocr_text || r.notes, MAX_DESCRIPTION);
  const category = safeString(r.category || r.category_label, 70) || "18";
  const visibility = r.visibility === "private" || r.private === true ? "private"
    : r.visibility === "public" || r.private === false ? "public" : "unknown";
  const evidence = safeString(r.verification || r.description_status || r.evidence, 100) || "imported_unverified";
  const imageId = safeString(r.id, 90);
  const id = kind === "repo" ? `repo:${name.toLowerCase()}`
    : kind === "web" ? `web:${idHash(url!)}` : `image:${idHash(imageId || name + description)}`;
  const source: Record<string, unknown> = {
    name, url, category, description, visibility, evidence,
    upstream: safeString(r.upstream, 200),
    tags: Array.isArray(r.tags) ? r.tags.filter(x => typeof x === "string").slice(0, 50) : [],
    linkedRepo: safeString(r.linkedRepo || r.linked_repo, 200),
    title: safeString(r.title, MAX_TITLE),
  };
  return { id, kind, name, description, url, category, visibility, evidence, source };
}

const stop = new Set("the and for with from this that what which when where how can could would should does about into your mine them there their whole find show tell list best all any are has have between better new free tools tool repo repos repository repositories projects project code source sourcecode me i to is in a of on to do we use using an or it by you my it be at as".split(" "));
function tokens(text: string): string[] {
  return [...new Set((text.toLowerCase().match(/[a-z0-9]+/g) || [])
    .filter(x => x.length > 2 && !stop.has(x)))];
}
const synonyms: Record<string, string[]> = {
  video: ["clip", "shorts", "editing", "render", "motion"],
  clip: ["video", "highlight", "short", "caption", "tiktok"],
  voice: ["speech", "audio", "transcription", "tts", "stt"],
  receptionist: ["phone", "voice", "telephony", "customer"],
  website: ["frontend", "design", "web", "ui"],
  design: ["ui", "ux", "animation", "motion", "frontend"],
  research: ["scrape", "crawl", "search", "collect", "data"],
  crypto: ["web3", "blockchain", "token", "trading"],
  autonomous: ["agent", "automation", "orchestration"],
  agent: ["skills", "tools", "orchestration", "memory"],
  fork: ["github", "git", "repository"],
};
export function searchAtlas(items: AtlasItem[], question: string, max = 30): { item: AtlasItem; score: number; matched: string[] }[] {
  const terms = tokens(question);
  const expanded = [...terms, ...terms.flatMap(t => synonyms[t] || [])];
  const uniqueTerms = [...new Set(expanded)];
  return items.map(item => {
    const n = item.name.toLowerCase();
    const d = item.description.toLowerCase();
    const c = item.category.toLowerCase();
    const matched = uniqueTerms.filter(t => n.includes(t) || d.includes(t) || c.includes(t));
    const score = matched.reduce((s,t) => s + (n.includes(t) ? 9 : 0) + (d.includes(t) ? 3 : 0) + (c === t ? 3 : 0), 0) + (n.includes(question.trim().toLowerCase()) ? 14 : 0);
    return { item, matched, score };
  }).filter(x => x.score > 0).sort((a,b) => b.score - a.score || a.item.name.localeCompare(b.item.name)).slice(0, max);
}

