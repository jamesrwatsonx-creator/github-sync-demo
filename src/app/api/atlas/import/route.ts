import { NextResponse } from "next/server";
import { checkAtlasAccess, readSmallJson } from "@/lib/atlas/security";
import { normalizeItem } from "@/lib/atlas/catalog";
import { upsertItems } from "@/lib/atlas/database";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(request: Request) {
  const denial = checkAtlasAccess(request);
  if (denial) return denial;
  try {
    const parsed = await readSmallJson(request);
    const p = parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : {};
    const repos = Array.isArray(p.repositories) ? p.repositories : Array.isArray(p.repos) ? p.repos : [];
    const resources = Array.isArray(p.resources) ? p.resources : [];
    const images = Array.isArray(p.images) ? p.images : [];
    if (repos.length + resources.length + images.length > 200) {
      return NextResponse.json({ error: "Import in batches of up to 200 items." }, { status: 413 });
    }
    const items = [
      ...repos.map(r => normalizeItem(r, "repo")),
      ...resources.map(r => normalizeItem(r, "web")),
      ...images.map(r => normalizeItem(r, "image")),
    ].filter((x): x is NonNullable<typeof x> => x !== null);
    const unique = [...new Map(items.map(x => [x.id,x])).values()];
    await upsertItems(unique);
    return NextResponse.json({ imported: unique.length, skipped: repos.length + resources.length + images.length - unique.length });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Invalid import." }, { status: 400 });
  }
}

