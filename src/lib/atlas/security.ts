import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

/** Protect every Atlas API endpoint; never ship the secret to static HTML. */
export function checkAtlasAccess(request: Request): NextResponse | null {
  const expected = process.env.ATLAS_ADMIN_KEY;
  if (!expected || expected.length < 24) {
    return NextResponse.json(
      { error: "Atlas is not configured. Set ATLAS_ADMIN_KEY (24+ characters) on the server." },
      { status: 503 },
    );
  }
  const bearer = request.headers.get("authorization") || "";
  const supplied = bearer.startsWith("Bearer ") ? bearer.slice(7) : "";
  const a = Buffer.from(createHash("sha256").update(expected).digest("hex"));
  const b = Buffer.from(createHash("sha256").update(supplied).digest("hex"));
  if (!supplied || !timingSafeEqual(a, b)) {
    return NextResponse.json({ error: "Atlas access denied." }, { status: 401 });
  }
  return null;
}

export async function readSmallJson(request: Request, maxBytes = 4_000_000): Promise<unknown> {
  if (Number(request.headers.get("content-length") || 0) > maxBytes) {
    throw new Error(`Request exceeds ${maxBytes} bytes.`);
  }
  if (!request.body) throw new Error("Missing request body.");
  const reader = request.body.getReader();
  let total = 0;
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) throw new Error("Request body too large.");
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const body = Buffer.concat(chunks.map(x => Buffer.from(x))).toString("utf8");
  return JSON.parse(body);
}

