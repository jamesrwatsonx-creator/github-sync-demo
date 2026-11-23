"use client";

import { useCallback, useState, type FormEvent } from "react";

type Item = { id:string;kind:string;name:string;description:string;url:string|null;category:string;visibility:string;evidence:string };
type Source = Item & { index:number;score:number };
type Answer = { question:string; answer:string; sources:Source[]; mode:string };

function readAtlasFile(text:string, filename:string): Record<string, unknown> {
  if (/\.html?$/i.test(filename)) {
    const dom = new DOMParser().parseFromString(text, "text/html");
    const node = dom.querySelector("#seed-data,#atlas-data,#repo-data");
    if (!node?.textContent) throw new Error("No Atlas seed-data / atlas-data element found in HTML.");
    return JSON.parse(node.textContent) as Record<string, unknown>;
  }
  return JSON.parse(text) as Record<string, unknown>;
}
function asArray(x:unknown):unknown[] {return Array.isArray(x)?x:[]}
function inputStyle(){return "w-full rounded-xl border border-neutral-300 bg-white px-3 py-3 text-neutral-900 placeholder-neutral-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange-500"}

export default function AtlasPage() {
  const [secret,setSecret]=useState("");
  const [question,setQuestion]=useState("");
  const [answers,setAnswers]=useState<Answer[]>([]);
  const [busy,setBusy]=useState(false);
  const [notice,setNotice]=useState("Your database is private. Enter the Atlas access key set in your server environment.");
  const [items,setItems]=useState<Item[]>([]);
  const [total,setTotal]=useState<number|null>(null);
  const [offset,setOffset]=useState(0);
  const [addUrl,setAddUrl]=useState("");
  const [webUrl,setWebUrl]=useState("");
  const [webTitle,setWebTitle]=useState("");
  const [imageNote,setImageNote]=useState("");
  const [imageTitle,setImageTitle]=useState("");
  const headers = useCallback(() => ({Authorization:`Bearer ${secret}`,"Content-Type":"application/json"}),[secret]);
  const loadItems = useCallback(async (at=0) => {
    if (!secret) return;
    const r=await fetch(`/api/atlas/items?limit=50&offset=${at}`,{headers:headers(),cache:"no-store"});
    const data=await r.json();if(!r.ok)throw new Error(data.error||"Failed to load catalogue.");
    setItems(data.items);setTotal(data.total);setOffset(at);
  },[secret,headers]);
  async function doImport(payload:Record<string,unknown>){
    const repos=asArray(payload.repositories).length?asArray(payload.repositories):asArray(payload.repos);
    const resources=asArray(payload.resources),images=asArray(payload.images);
    const all=[...repos.map(x=>({kind:"repo",record:x})),...resources.map(x=>({kind:"web",record:x})),...images.map(x=>({kind:"image",record:x}))];
    if (!all.length) throw new Error("No records found in selected Atlas file.");
    let imported=0;
    for(let i=0;i<all.length;i+=150){
      const batch=all.slice(i,i+150),body={repositories:batch.filter(x=>x.kind==="repo").map(x=>x.record),resources:batch.filter(x=>x.kind==="web").map(x=>x.record),images:batch.filter(x=>x.kind==="image").map(x=>x.record)};
      const r=await fetch("/api/atlas/import",{method:"POST",headers:headers(),body:JSON.stringify(body)});const data=await r.json();
      if(!r.ok)throw new Error(data.error||"Import failed");
      imported+=data.imported;setNotice(`Imported ${imported} of ${all.length} records…`);
    }
    setNotice(`Imported ${imported} records into private PostgreSQL catalogue. Duplicate GitHub owner/repo identifiers were updated, not duplicated.`);
    await loadItems(0);
  }
  async function handleFile(file:File|undefined){if(!file)return;setBusy(true);try{const p=readAtlasFile(await file.text(),file.name);await doImport(p)}catch(e){setNotice(e instanceof Error?e.message:"Import failed")}finally{setBusy(false)}}
  async function addRepo(){const n=addUrl.trim().match(/^(?:https?:\/\/github\.com\/)?([\w.-]+)\/([\w.-]+)(?:\/.*)?$/i);if(!n){setNotice("Paste github.com/owner/repo or owner/repo.");return}setBusy(true);try{await doImport({repositories:[{name:`${n[1]}/${n[2]}`,url:`https://github.com/${n[1]}/${n[2]}`,description:"Unverified; GitHub metadata not yet inspected",category:"18",visibility:"unknown"}]});setAddUrl("")}catch(e){setNotice(String(e))}finally{setBusy(false)}}
  async function addWeb(){let u:URL;try{u=new URL(webUrl.trim());if(!["http:","https:"].includes(u.protocol))throw Error();}catch{setNotice("Enter an HTTP or HTTPS webpage URL.");return}setBusy(true);try{await doImport({resources:[{url:u.href,title:webTitle.trim()||u.hostname,description:webTitle.trim()||"Saved webpage; content not independently fetched",category:"18"}]});setWebUrl("");setWebTitle("")}catch(e){setNotice(String(e))}finally{setBusy(false)}}
  async function addImageNote(){if(!imageTitle.trim()&&!imageNote.trim()){setNotice("Add a title or extracted text from your screenshot.");return;}setBusy(true);try{await doImport({images:[{id:crypto.randomUUID(),title:imageTitle.trim()||"Screenshot",ocrText:imageNote.trim(),category:"18"}]});setImageTitle("");setImageNote("")}catch(e){setNotice(String(e))}finally{setBusy(false)}}
  async function ask(event:FormEvent){event.preventDefault();const q=question.trim();if(!q||busy||!secret)return;setBusy(true);setNotice("Retrieving relevant Atlas records…");try{const r=await fetch("/api/atlas/chat",{method:"POST",headers:headers(),body:JSON.stringify({question:q,history:answers.slice(-5)})});const data=await r.json();if(!r.ok)throw new Error(data.error||"Chat request failed");setAnswers(v=>[...v,{question:q,answer:data.answer,sources:data.sources,mode:data.mode}]);setQuestion("");setNotice(`Searched ${data.total} catalogue entries · ${data.mode==='llm_grounded'?'AI answer with evidence':'Source retrieval mode (no model API configured)'}`)}catch(e){setNotice(e instanceof Error?e.message:"Chat unavailable")}finally{setBusy(false)}}
  return <main className="h-screen overflow-y-auto bg-[#101113] px-4 py-8 text-[#f7f3ec] sm:px-8">
    <div className="mx-auto max-w-7xl">
      <nav aria-label="Site navigation" className="mb-8 text-sm"><a className="text-orange-300 underline" href="/">← Single-repository code chat</a></nav>
      <h1 className="mb-2 text-4xl font-semibold tracking-tight">Repository <span className="text-orange-300">Atlas Intelligence</span></h1>
      <p className="mb-7 max-w-4xl text-neutral-300">Chat across your repository catalogue, saved web links and image notes. Answers are based on indexed descriptions and evidence; open an individual repo for source-code analysis via Chroma.</p>
      <div className="mb-5 rounded-xl border border-orange-800/60 bg-[#262120] p-4"><label className="block text-sm font-medium" htmlFor="atlasKey">Private Atlas access key</label><div className="mt-2 flex flex-wrap gap-2"><input id="atlasKey" type="password" autoComplete="off" value={secret} onChange={e=>setSecret(e.target.value)} className={`${inputStyle()} min-w-48 flex-1`} placeholder="Enter ATLAS_ADMIN_KEY (never saved in browser storage)"/><button type="button" className="rounded-xl bg-orange-300 px-4 py-2 font-semibold text-neutral-900 disabled:opacity-50" onClick={()=>loadItems(0).then(()=>setNotice("Connected to private Atlas database.")).catch(e=>setNotice(e.message))} disabled={!secret||busy}>Connect</button></div><p className="mt-2 text-xs text-neutral-400">Server-protected personal workspace. Do not expose your private Atlas imports on a public static site.</p></div>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(270px,350px)]">
        <section aria-label="Conversation" className="rounded-2xl border border-neutral-700 bg-[#1a1c1f] p-4 sm:p-6">
          <h2 className="mb-4 text-xl font-semibold">Chat with my entire Atlas</h2>
          <div className="min-h-64 space-y-5" aria-live="polite">
            {answers.length===0&&<p className="text-neutral-400">Try: “Which repositories can create a self-hosted AI receptionist with voice and business automations?” or “Compare my video clipping repos and recommend a stack.”</p>}
            {answers.map((a,i)=><article key={i} className="border-b border-neutral-700 pb-5"><h3 className="mb-2 font-semibold text-orange-300">{a.question}</h3><p className="whitespace-pre-wrap text-sm leading-relaxed text-neutral-100">{a.answer}</p><div className="mt-3"><p className="mb-1 text-xs font-bold text-neutral-400">Source records · {a.mode}</p><ol className="list-inside list-decimal space-y-1 text-sm">{a.sources.map((r,j)=><li key={r.id+j}>{r.url?<a className="text-orange-300 underline" target="_blank" rel="noreferrer" href={r.url}>{r.name}</a>:r.name} <span className="text-xs text-neutral-400">({r.evidence})</span> {r.kind==='repo'&&<a className="ml-2 text-sky-300 underline" href={`/${r.name.split('/').map(encodeURIComponent).join('/')}`}>Inspect code</a>}</li>)}</ol></div></article>)}
          </div>
          <form onSubmit={ask} className="mt-5 flex flex-wrap gap-2"><label className="sr-only" htmlFor="atlas-question">Ask about the database</label><input id="atlas-question" value={question} onChange={e=>setQuestion(e.target.value)} placeholder="Ask anything about your repository collection…" className={`${inputStyle()} min-w-48 flex-1`} maxLength={1500}/><button disabled={!secret||busy||!question.trim()} className="rounded-xl bg-orange-300 px-5 py-2 font-bold text-neutral-900 disabled:opacity-50">Ask Atlas</button></form>
        </section>
        <aside className="space-y-5">
          <section className="rounded-2xl border border-neutral-700 bg-[#1a1c1f] p-4"><h2 className="mb-2 text-xl font-semibold">Import your existing database</h2><p className="mb-3 text-sm text-neutral-400">Import the previous personal Atlas JSON or portable HTML. This works for the original 1,354-entry catalogue, plus website links and OCR image notes.</p><label className="block text-sm" htmlFor="atlasFile">Atlas JSON / HTML file</label><input id="atlasFile" type="file" accept=".json,.html,.htm" className="mt-2 w-full text-sm" disabled={!secret||busy} onChange={e=>{void handleFile(e.target.files?.[0]);e.target.value=""}}/><p className="mt-2 text-xs text-neutral-400">Images remain local; only their searchable text/metadata are imported. No image binary is uploaded by this flow.</p></section>
          <section className="rounded-2xl border border-neutral-700 bg-[#1a1c1f] p-4"><h2 className="mb-3 text-xl font-semibold">Add a repository</h2><div className="space-y-2"><input aria-label="GitHub repository" className={inputStyle()} placeholder="github.com/owner/repo" value={addUrl} onChange={e=>setAddUrl(e.target.value)}/><button disabled={!secret||busy||!addUrl} className="rounded-xl border border-orange-300 px-3 py-2 text-orange-200 disabled:opacity-50" type="button" onClick={addRepo}>Save repository reference</button><p className="text-xs text-neutral-400">New links enter the catalogue as unverified. Use existing repo chat to inspect source files. Fork through GitHub from the repository page.</p></div></section>
          <section className="rounded-2xl border border-neutral-700 bg-[#1a1c1f] p-4"><h2 className="mb-3 text-xl font-semibold">Save a website</h2><div className="space-y-2"><input aria-label="Webpage URL" className={inputStyle()} placeholder="https://example.com" value={webUrl} onChange={e=>setWebUrl(e.target.value)}/><input aria-label="Website title" className={inputStyle()} placeholder="What does this page contain?" value={webTitle} onChange={e=>setWebTitle(e.target.value)}/><button type="button" disabled={!secret||busy||!webUrl} onClick={addWeb} className="rounded-xl border border-orange-300 px-3 py-2 text-orange-200 disabled:opacity-50">Add website link</button></div></section>
          <section className="rounded-2xl border border-neutral-700 bg-[#1a1c1f] p-4"><h2 className="mb-3 text-xl font-semibold">Add image research notes</h2><div className="space-y-2"><input aria-label="Image title" className={inputStyle()} placeholder="Screenshot title" value={imageTitle} onChange={e=>setImageTitle(e.target.value)}/><textarea aria-label="Image text or OCR notes" className={inputStyle()} placeholder="Paste text found in the screenshot (or import an exported Atlas image record)" value={imageNote} onChange={e=>setImageNote(e.target.value)} rows={3}/><button type="button" disabled={!secret||busy||(!imageNote&&!imageTitle)} onClick={addImageNote} className="rounded-xl border border-orange-300 px-3 py-2 text-orange-200 disabled:opacity-50">Save image notes</button><p className="text-xs text-neutral-400">Original image uploads stay in your personal local Atlas until encrypted object storage is configured; this server stores search-friendly notes only.</p></div></section>
          <section className="rounded-2xl border border-neutral-700 bg-[#1a1c1f] p-4"><h2 className="mb-3 text-xl font-semibold">Database {total===null?'':`· ${total.toLocaleString()} records`}</h2><ol className="space-y-2 text-sm">{items.map(r=><li key={r.id} className="border-b border-neutral-700 pb-2"><a href={r.url||'#'} target="_blank" rel="noreferrer" className="break-words text-orange-300 underline">{r.name}</a><p className="line-clamp-2 text-xs text-neutral-400">{r.description}</p></li>)}</ol><div className="mt-3 flex gap-2"><button type="button" className="rounded-lg border border-neutral-600 px-3 py-2 disabled:opacity-40" disabled={busy||!secret||offset===0} onClick={()=>loadItems(Math.max(0,offset-50)).catch(e=>setNotice(e.message))}>Previous</button><button type="button" className="rounded-lg border border-neutral-600 px-3 py-2 disabled:opacity-40" disabled={busy||!secret||total===null||offset+50>=total} onClick={()=>loadItems(offset+50).catch(e=>setNotice(e.message))}>Next</button></div></section>
        </aside>
      </div>
      <p className="mt-5 rounded-xl border border-neutral-700 bg-[#22252a] p-3 text-sm text-neutral-300" role="status" aria-live="polite">{notice}</p>
    </div>
  </main>;
}

