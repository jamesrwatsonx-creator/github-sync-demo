import { NextResponse } from "next/server";
import { checkAtlasAccess } from "@/lib/atlas/security";
import { getItemPage } from "@/lib/atlas/database";

export const runtime = "nodejs";
export async function GET(request: Request) {
  const denial = checkAtlasAccess(request);
  if (denial) return denial;
  try {
    const url = new URL(request.url);
    const limit = Math.max(1, Math.min(100, Number(url.searchParams.get("limit")) || 50));
    const offset = Math.max(0, Math.min(100000, Number(url.searchParams.get("offset")) || 0));
    const data = await getItemPage(limit, offset);
    return NextResponse.json(data, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ error: "Atlas database unavailable." }, { status: 503 });
  }
}

