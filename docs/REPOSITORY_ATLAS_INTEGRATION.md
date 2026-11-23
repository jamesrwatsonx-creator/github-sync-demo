# Repository Atlas Intelligence — private, deployable catalogue chat

## Verified starting point

The `github-sync-demo` fork already supports repository-specific code chat: GitHub metadata/tree → Chroma Sync API incremental repository ingestion → a Chroma collection → OpenAI chat tools (semantic code search, file read and grep). The demo does **not** index or search all the user's historical Atlas catalogue automatically.

This integration adds a **separate PostgreSQL catalogue** with authenticated REST endpoints and an `/atlas` page. No existing single-repository code route is changed. Chroma still handles code-level retrieval for a selected repository; catalogue chat handles cross-repository metadata, web resource notes and screenshot/OCR text. They are different sources with different confidence levels.

## Deploy

1. Use the user's already-owned GitHub fork `jamesrwatsonx-creator/github-sync-demo`. Deploy the feature branch (or merge its PR) through Vercel. A live deployment has not been performed in this task.
2. In Vercel Project → Settings → Environment Variables, configure `DATABASE_URL` (existing PostgreSQL) and `ATLAS_ADMIN_KEY` (a **random 24+ character secret**, generated locally). Set `OPENAI_API_KEY` for natural-language LLM answers; if missing, chat provides deterministic source retrieval. Set optional `ATLAS_CHAT_MODEL` to an available model, default `gpt-4.1-mini`.
3. The existing single-repository Chroma functions also require `CHROMA_API_KEY`, `CHROMA_TENANT`, `CHROMA_DATABASE`, and `GITHUB_TOKEN` as stated in the original README. Those credentials are separate from the Atlas catalogue.
4. Run `pnpm install`, database initialization happens on the first authorized `/api/atlas/*` request, and `pnpm build`. Visit `/atlas`, enter `ATLAS_ADMIN_KEY` and choose **Connect**.
5. **Import your existing Atlas HTML/JSON**, previously exported from the personal v3/v4 website. The import accepts `repositories` or `repos` plus `resources` and `images`; it sends items in batches of 150 and deduplicates by lowercased owner/repo. The 1,354-entry database is **not embedded in this public source repository**. Private records remain protected by the admin key and server-side database.
6. Ask questions in the `/atlas` chat. The API retrieves and ranks candidates across up to 12,000 records, sends only the relevant metadata snippets to the configured model, and returns clickable evidence references. Select **Inspect code** for a repo's existing Chroma single-codebase chat (it must be synced/indexed there).

### API contracts

- `POST /api/atlas/import` — authorized Bearer key; JSON `{repositories?:[],repos?:[],resources?:[],images?:[]}` maximum 200 entries, 4 MB per request. Creates/upserts records. Images are indexed by metadata/OCR text, **never raw embedded data URLs**.
- `GET /api/atlas/items?limit=50&offset=0` — authorized, paginated listings; returns `{total,items}`.
- `POST /api/atlas/chat` — authorized, JSON `{question,history?}`; returns `{answer,sources,mode,total}`. `mode="retrieval"` without an LLM API; `llm_grounded` when configured.

### Security

- **Never commit your original 30 private repo names or exported personal HTML into this public fork.** Import them only through `/atlas` with the secret after deployment.
- API uses constant-time SHA-256 comparison of server-configured secret; the browser holds the secret only in React component state, not storage.
- Data separation is single-owner MVP, not a multi-tenant auth system. The admin key is sufficient for personal deployment but should eventually be replaced with GitHub OAuth/App + server sessions and per-item permissions for collaborators.
- All APIs require admin authorization, but the `/atlas` page shell itself is public without data until authorized. Use HTTPS for production.
- Security posture: self-hosted catalogue chat sends *selected snippets of private descriptions/notes* to OpenAI if the LLM is enabled; users who require private/on-device inference should use retrieval-only mode or replace the provider. No entire repo source is uploaded by this new catalogue feature.
- GitHub user actions such as forking still occur through the existing signed-in GitHub UI; this feature does not falsely claim to fork via an unauthenticated browser.
- Source material can contain instructions. Treat it as untrusted input; the system prompt explicitly forbids obeying instructions from descriptions. For stronger production isolation, adopt strict tool schemas and source content normalization, permissions and retrieval filtering.

### Scope and limitations

- This is a production-*deployable* code integration, not a live deployment. It has not been tested against live Vercel/PostgreSQL/Chroma/OpenAI credentials in this environment.
- Atlas-wide search is based on imported metadata text, not per-repo semantic code embeddings. Deep source inspection is opt-in per repository via the original Chroma feature. A future phase can create a separate Chroma collection for Atlas-wide metadata vectors and incremental sync, but must not index 1,354 full codebases by default.
- Generic web URLs are stored as user notes, not crawled automatically. Image binaries stay in the personal HTML; screenshots become searchable after OCR text or annotations have been provided and imported.
- Classification from older catalogue data is preserved, and new manual links are initially `Unclassified` until verified. Automatic GitHub metadata enrichment remains separate follow-up work.
- No GitHub repo was renamed, deleted, or pushed to its default branch in this work.

## Acceptance checks

- [ ] Set all environment variables; deploy to Vercel successfully
- [ ] Connect to `/atlas` using the configured secret
- [ ] Import original 1,354-entry full JSON, verify `total = 1354`
- [ ] Re-import the file, verify count unchanged (canonical deduplication)
- [ ] Ask a cross-repository question and inspect relevant source citations
- [ ] Import a website and OCR screenshot note, then retrieve them in chat
- [ ] Verify all three endpoints return HTTP 401 with incorrect key
- [ ] Verify private data cannot be fetched without the key
- [ ] Click "Inspect code" on a synced repo and use original Chroma chat
- [ ] Run `pnpm build` and automated tests on deploy target

