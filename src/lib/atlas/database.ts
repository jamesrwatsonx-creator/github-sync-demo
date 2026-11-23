import postgres from "postgres";
import type { AtlasItem } from "./catalog";

let connection: ReturnType<typeof postgres> | null = null;
let initialization: Promise<void> | null = null;
function client() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL not configured");
  connection ??= postgres(process.env.DATABASE_URL, { max: 2, idle_timeout: 20 });
  return connection;
}
async function ready(): Promise<void> {
  const sql = client();
  initialization ??= (async () => {
    await sql`CREATE TABLE IF NOT EXISTS atlas_items (
      id text PRIMARY KEY,
      kind text NOT NULL,
      name text NOT NULL,
      description text NOT NULL DEFAULT '',
      url text,
      category text NOT NULL DEFAULT '18',
      visibility text NOT NULL DEFAULT 'unknown',
      evidence text NOT NULL DEFAULT 'unverified',
      source jsonb NOT NULL DEFAULT '{}'::jsonb,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )`;
    await sql`CREATE INDEX IF NOT EXISTS atlas_items_kind_idx ON atlas_items (kind)`;
    await sql`CREATE INDEX IF NOT EXISTS atlas_items_updated_idx ON atlas_items (updated_at DESC)`;
  })().catch(error => { initialization = null; throw error; });
  await initialization;
}
export async function upsertItems(items: AtlasItem[]): Promise<void> {
  await ready();
  const sql = client();
  // Same ID (including case-folded GitHub owner/repo) is always one record.
  await sql.begin(async tx => {
    for (const item of items) {
      await tx`INSERT INTO atlas_items (id,kind,name,description,url,category,visibility,evidence,source)
        VALUES (${item.id},${item.kind},${item.name},${item.description},${item.url},${item.category},${item.visibility},${item.evidence},${sql.json(item.source)})
        ON CONFLICT (id) DO UPDATE SET
          kind=EXCLUDED.kind, name=EXCLUDED.name, description=EXCLUDED.description,
          url=EXCLUDED.url, category=EXCLUDED.category, visibility=EXCLUDED.visibility,
          evidence=EXCLUDED.evidence, source=EXCLUDED.source, updated_at=now()`;
    }
  });
}
export async function getAllItems(): Promise<AtlasItem[]> {
  await ready();
  const rows = await client()`SELECT id,kind,name,description,url,category,visibility,evidence,source FROM atlas_items ORDER BY name ASC LIMIT 12000`;
  return rows as AtlasItem[];
}
export async function getItemPage(limit: number, offset: number): Promise<{total:number;items:AtlasItem[]}> {
  await ready();
  const sql = client();
  const [counts,rows] = await Promise.all([
    sql`SELECT count(*)::integer AS n FROM atlas_items`,
    sql`SELECT id,kind,name,description,url,category,visibility,evidence,source FROM atlas_items ORDER BY name ASC LIMIT ${limit} OFFSET ${offset}`,
  ]);
  return { total: Number(counts[0].n), items: rows as AtlasItem[] };
}

