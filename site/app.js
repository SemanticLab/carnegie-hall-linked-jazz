/* Carnegie Hall × Linked Jazz — hash-routed static app.
   Data: ./data/*.json built by ../build. No dependencies. */
"use strict";

const $ = (sel, el = document) => el.querySelector(sel);
const app = $("#app");
const cache = {};

async function getJSON(path) {
  if (cache[path]) return cache[path];
  const r = await fetch(path);
  if (!r.ok) throw new Error(`${r.status} ${path}`);
  const j = await r.json();
  cache[path] = j;
  return j;
}

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
/* escape, then highlight every "Carnegie Hall" mention in a transcript snippet */
const hlCH = (s) => esc(s).replace(/Carnegie\s+Hall/gi, '<mark class="chq">$&</mark>');
/* truncate a long passage to a window that keeps the "Carnegie Hall" mention visible */
const snipCH = (t, cap = 320) => {
  if (t.length <= cap) return t;
  const i = t.search(/Carnegie\s+Hall/i);
  if (i < cap - 40) return t.slice(0, cap - 3) + "…";
  const start = t.lastIndexOf(" ", i - 100) + 1;
  return "…" + t.slice(start, start + cap - 6).trimEnd() + "…";
};
const fmtDate = (d) => {
  if (!d) return "date unknown";
  const [y, m, day] = d.split("-");
  const months = ["", "January", "February", "March", "April", "May", "June", "July",
    "August", "September", "October", "November", "December"];
  return m ? `${months[+m]} ${day ? +day + ", " : ""}${y}` : y;
};
const nfmt = (n) => (n ?? 0).toLocaleString("en-US");
const roleFmt = (roles) => roles.map((r) => r.replace(/_/g, " ")).join(", ");

const SRC = {
  ch: '<span class="src ch">Carnegie Hall performance history</span>',
  lj: '<span class="src lj">Jazz oral histories · Linked Jazz</span>',
  wiki: '<span class="src wiki">Wikidata / Wikipedia</span>',
  ai: '<span class="src ai" title="Match suggested by a local LLM (Qwen), shown with confidence">AI-suggested match</span>',
};

/* ---------------- router ---------------- */
const routes = {
  "": home, "people": home, "voices": voices, "about": about,
  "person": person, "event": eventPage, "concerts": concerts, "memories": memories,
  "coperformers": coperformers,
};
async function route() {
  const hash = location.hash.replace(/^#\/?/, "");
  const [view, arg] = hash.split("/");
  document.querySelectorAll("nav.main a").forEach((a) => {
    a.classList.toggle("active", a.dataset.v === (view || "people") ||
      (a.dataset.v === "people" && view === "person") ||
      (a.dataset.v === "concerts" && view === "event"));
  });
  app.innerHTML = '<div class="loading">Loading…</div>';
  try {
    await (routes[view] || home)(arg);
    if (!hash.includes("__keep")) window.scrollTo(0, 0);
  } catch (e) {
    app.innerHTML = `<div class="wrap notfound"><p>Couldn't load this page.</p>
      <p style="color:var(--muted);font-size:13px">${esc(e.message)}</p></div>`;
  }
}
window.addEventListener("hashchange", route);

/* ---------------- home ---------------- */
let gridState = { q: "", mode: "iv", sort: "concerts" };
async function home() {
  const [idx, meta] = await Promise.all([
    getJSON("data/people_index.json"), getJSON("data/meta.json"),
  ]);
  const c = meta.counts;
  app.innerHTML = `
  <div class="wrap">
    <div class="hero">
      <h1><em>Carnegie Hall</em> × Linked Jazz</h1>
      <p class="lede">Carnegie Hall's <a href="https://github.com/CarnegieHall/linked-data" target="_blank" rel="noopener">performance-history archive</a>
      documents every event on its stages since 1891. The <a href="#/about">Linked Jazz oral-history corpus</a>
      holds 1,347 interviews with the musicians themselves. This site joins them:
      <b>${nfmt(c.people)} people appear in both</b> — their documented concerts on one side,
      their voices on the other.</p>
    </div>

    <div class="prov">
      <div class="card lead">
        <h3>${SRC.ch}</h3>
        <p>Programs, dates, works &amp; roles from the Carnegie Hall Linked Open Data release (CC0).</p>
        <div class="nums"><div><b>${nfmt(c.ch_events_total)}</b><span>events 1891–2026</span></div>
        <div><b>${nfmt(c.people)}</b><span>matched people</span></div></div>
      </div>
      <div class="card lj-lead">
        <h3>${SRC.lj}</h3>
        <p>Four archives of jazz oral-history interviews, entity-resolved and reconciled to Wikidata.</p>
        <div class="nums"><div><b>${nfmt(c.interviewees)}</b><span>interviewees matched</span></div>
        <div><b>${nfmt(c.voices)}</b><span>Carnegie Hall mentions</span></div></div>
      </div>
      <div class="card wiki-lead">
        <h3>${SRC.wiki}</h3>
        <p>The join key: shared Wikidata QIDs. Portraits and bios come from Wikimedia.</p>
        <div class="nums"><div><b>${nfmt(c.quotes_judged)}</b><span>quotes AI-reviewed</span></div>
        <div><b>${nfmt(c.quotes_matched)}</b><span>pinned to a concert</span></div></div>
      </div>
    </div>

    <h2 class="sect">The musicians</h2>
    <p class="sect-sub">People in both datasets. <b>Interviewees</b> told their own story in an oral history <em>and</em> appear in Carnegie Hall's programs.</p>
    <div class="toolbar">
      <input type="search" id="q" placeholder="Search a name…" value="${esc(gridState.q)}">
      <span class="toggle">
        <button data-m="iv">Interviewees</button>
        <button data-m="all">Everyone</button>
      </span>
      <select id="sort">
        <option value="concerts">Most Carnegie Hall concerts</option>
        <option value="docs">Most talked about in interviews</option>
        <option value="name">A–Z</option>
      </select>
      <span class="count-note" id="cnote"></span>
    </div>
    <div class="grid" id="grid"></div>
    <button class="showmore" id="more" style="display:none">Show more</button>
    <button class="showmore" id="showall" style="display:none">Show all</button>
  </div>`;

  const grid = $("#grid"), qEl = $("#q"), sortEl = $("#sort"), more = $("#more"), all = $("#showall");
  sortEl.value = gridState.sort;
  let shown = 150;
  const render = () => {
    document.querySelectorAll(".toggle button").forEach((b) =>
      b.classList.toggle("on", b.dataset.m === gridState.mode));
    let rows = idx;
    if (gridState.mode === "iv") rows = rows.filter((p) => p.iv);
    const q = gridState.q.trim().toLowerCase();
    if (q) rows = rows.filter((p) => (p.name || "").toLowerCase().includes(q));
    rows = [...rows].sort(
      gridState.sort === "name" ? (a, b) => (a.name || "").localeCompare(b.name || "") :
      gridState.sort === "docs" ? (a, b) => b.docs - a.docs :
      (a, b) => b.concerts - a.concerts);
    $("#cnote").textContent = `${nfmt(rows.length)} people`;
    grid.innerHTML = rows.slice(0, shown).map(pcard).join("");
    const hidden = rows.length > shown;
    more.style.display = all.style.display = hidden ? "" : "none";
    if (hidden) all.textContent = `Show all ${nfmt(rows.length)}`;
  };
  qEl.addEventListener("input", () => { gridState.q = qEl.value; shown = 150; render(); });
  sortEl.addEventListener("change", () => { gridState.sort = sortEl.value; shown = 150; render(); });
  document.querySelectorAll(".toggle button").forEach((b) =>
    b.addEventListener("click", () => { gridState.mode = b.dataset.m; shown = 150; render(); }));
  more.addEventListener("click", () => { shown += 150; render(); });
  all.addEventListener("click", () => { shown = Infinity; render(); });
  render();
}

function pcard(p) {
  const initials = (p.name || "?").split(/\s+/).map((w) => w[0]).slice(0, 2).join("");
  const ph = p.thumb
    ? `<div class="ph" style="background-image:url('${esc(p.thumb)}')"></div>`
    : `<div class="ph">${esc(initials)}</div>`;
  const span = p.first ? (p.first === p.last ? p.first : `${p.first}–${p.last}`) : "";
  return `<a class="pcard" href="#/person/${p.qid}">${ph}
    <div class="nm">${esc(p.name)} ${p.iv ? '<span class="badge-iv">INTERVIEWED</span>' : ""}</div>
    <div class="st"><b>${nfmt(p.concerts)}</b> concert${p.concerts === 1 ? "" : "s"}${span ? ` · ${span}` : ""}${p.quotes ? ` · ${p.quotes} quote${p.quotes === 1 ? "" : "s"}` : ""}</div>
  </a>`;
}

/* ---------------- person ---------------- */
async function person(qid) {
  const p = await getJSON(`data/people/${qid}.json`);
  const evIdx = await getJSON("data/events_index.json").catch(() => []);
  const eventPages = new Set(evIdx.map((e) => e.id));

  const life = [p.birth, p.death].some(Boolean)
    ? `${p.birth ? p.birth.slice(0, 4) : "?"} – ${p.death ? p.death.slice(0, 4) : ""}` : "";
  const span = p.concerts.length
    ? `${(p.concerts[0].date || "").slice(0, 4)}–${(p.concerts[p.concerts.length - 1].date || "").slice(0, 4)}` : "—";

  // quotes: rich + matched first
  const quotesHtml = p.quotes.map((q) => `
    <div class="quote">
      ${q.caption ? `<div class="cap">${esc(q.caption)}</div>` : ""}
      <blockquote>${hlCH(q.text)}</blockquote>
      <div class="meta">
        ${SRC.lj}
        ${q.event_id ? `<a class="matched" href="#/event/${q.event_id}">↳ pinned to a documented concert (${esc(q.match_conf)})</a> ${SRC.ai}` : ""}
        <span>${esc(q.collection)} · ${esc(q.doc_title || "")}</span>
        <a href="${esc(q.url)}" target="_blank" rel="noopener">original transcript at the archive ↗</a>
      </div>
    </div>`).join("");

  const aboutHtml = p.about_quotes.map((q) => `
    <div class="quote about-q">
      <div class="cap">${esc(q.speaker || "—")} <span class="rel">· ${esc(q.relation || "")}</span></div>
      <blockquote>${hlCH(q.evidence)}</blockquote>
      <div class="meta">${SRC.lj}<span>${esc(q.collection)} · ${esc(q.doc_title || "")}</span>
      ${q.url ? `<a href="${esc(q.url)}" target="_blank" rel="noopener">original transcript at the archive ↗</a>` : ""}</div>
    </div>`).join("");

  const matchedEvents = new Set(p.quotes.filter((q) => q.event_id).map((q) => q.event_id));
  const byDecade = {};
  p.concerts.forEach((c) => {
    const d = c.date ? `${c.date.slice(0, 3)}0s` : "Undated";
    (byDecade[d] = byDecade[d] || []).push(c);
  });
  const concertRow = (c) => {
    const label = eventPages.has(c.id)
      ? `<a href="#/event/${c.id}">${esc(c.label || "Untitled event")}</a>`
      : `${esc(c.label || "Untitled event")} <a href="http://data.carnegiehall.org/events/${c.id}" target="_blank" rel="noopener" title="Carnegie Hall data record" style="font-size:11px;color:var(--muted)">data ↗</a>`;
    return `<div class="concert">
      <div class="cd">${esc(c.date || "—")}</div>
      <div class="cl">${label} ${matchedEvents.has(c.id) ? '<span class="pin">● remembered in an interview</span>' : ""}</div>
      ${c.venue ? `<div class="cv">${esc(c.venue)}</div>` : ""}
      ${c.roles.length ? `<div class="croles">${esc(roleFmt(c.roles))}</div>` : ""}
      ${c.works.length ? `<ul class="cworks">${c.works.slice(0, 6).map((w) =>
        `<li>${esc(w.t)}${w.c ? ` <span style="color:var(--muted)">— ${esc(w.c)}</span>` : ""}</li>`).join("")}
        ${c.works.length > 6 ? `<li style="color:var(--muted)">+ ${c.works.length - 6} more</li>` : ""}</ul>` : ""}
    </div>`;
  };
  const decadesHtml = Object.entries(byDecade).map(([dec, list]) =>
    `<div class="decade">${dec} · ${list.length} concert${list.length === 1 ? "" : "s"}</div>` +
    list.map(concertRow).join("")).join("");

  app.innerHTML = `
  <div class="wrap">
    <div class="crumb"><a href="#/">← All musicians</a></div>
    <div class="person-head">
      ${p.image ? `<img class="portrait" src="${esc(p.image)}" alt="${esc(p.name)}" loading="lazy"
         onerror="this.style.display='none'">` : ""}
      <div class="info">
        <h1>${esc(p.name)}</h1>
        ${life ? `<div class="dates">${life}</div>` : ""}
        ${p.description ? `<div class="desc">${esc(p.description)}</div>` : ""}
        ${p.abstract ? `<div class="abstract">${esc(p.abstract)} ${SRC.wiki}</div>` : ""}
        <div class="id-links">
          <a href="${esc(p.ch_uri)}" target="_blank" rel="noopener">Carnegie Hall data ↗</a>
          <a href="https://www.wikidata.org/wiki/${esc(p.qid)}" target="_blank" rel="noopener">Wikidata ${esc(p.qid)} ↗</a>
          ${p.wp_title ? `<a href="https://en.wikipedia.org/wiki/${encodeURIComponent(p.wp_title)}" target="_blank" rel="noopener">Wikipedia ↗</a>` : ""}
        </div>
        ${p.match_basis && p.match_basis !== "qid" ? `<div style="margin-top:9px;font-size:12.5px;color:var(--muted)">
          ${p.match_basis === "name+dates"
            ? "The two archives were linked by exact name and matching life dates — Carnegie Hall's data carries no Wikidata ID for this person."
            : `The two archives were linked by name, verified by a local LLM against the documented concert record — Carnegie Hall's data carries no Wikidata ID for this person. <span class="src ai">AI-verified link</span>`}
        </div>` : ""}
      </div>
    </div>

    <div class="tiles">
      <div class="tile ch-t"><div class="lbl">Carnegie Hall concerts</div>
        <div class="val">${nfmt(p.concerts.length)}</div><div class="sub">${span}</div></div>
      <div class="tile ch-t"><div class="lbl">Works composed, played at CH</div>
        <div class="val">${nfmt(p.works_created.length)}</div><div class="sub">as composer/arranger</div></div>
      <div class="tile lj-t"><div class="lbl">Oral-history interviews</div>
        <div class="val">${nfmt(p.interviews.length)}</div><div class="sub">as interviewee</div></div>
      <div class="tile lj-t"><div class="lbl">Mentioned in interviews</div>
        <div class="val">${nfmt(p.lj_docs)}</div><div class="sub">${nfmt(p.lj_mentions)} mentions</div></div>
    </div>

    ${p.concerts.length > 1 ? `<div class="chartbox">
      <div class="chead"><h3>Carnegie Hall appearances by year</h3>${SRC.ch}</div>
      <div id="tl"></div></div>` : ""}

    ${p.quotes.length ? `<div class="sec">
      <div class="sec-head"><h2>In their own words</h2><span class="n">${p.quotes.length} passage${p.quotes.length === 1 ? "" : "s"} mentioning Carnegie Hall</span></div>
      ${quotesHtml}</div>` : ""}

    ${p.concerts.length ? `<div class="sec">
      <div class="sec-head"><h2>On the Carnegie Hall stage</h2><span class="n">${SRC.ch}</span></div>
      <div id="concerts">${decadesHtml}</div></div>` : ""}

    ${aboutHtml ? `<div class="sec">
      <div class="sec-head"><h2>What others said about ${esc((p.name || "").split(" ").slice(-1)[0])}</h2><span class="n">from the oral histories</span></div>
      ${aboutHtml}</div>` : ""}

    ${p.works_created.length ? `<div class="sec">
      <div class="sec-head"><h2>Compositions performed at Carnegie Hall</h2><span class="n">${SRC.ch}</span></div>
      <p style="font-size:14px;color:var(--ink-2)">${p.works_created.map((w) => esc(w.t)).join(" · ")}</p></div>` : ""}
  </div>`;

  if (p.concerts.length > 1) drawTimeline($("#tl"), p.concerts, matchedEvents);
}

/* Concerts-per-year column strip. Single series (CH crimson), 4px rounded
   data-end / square baseline, 2px gaps, hairline baseline, hover tooltip. */
function drawTimeline(el, concerts, matchedEvents) {
  const years = {};
  let matchedYears = new Set();
  concerts.forEach((c) => {
    if (!c.date) return;
    const y = +c.date.slice(0, 4);
    years[y] = (years[y] || 0) + 1;
    if (matchedEvents.has(c.id)) matchedYears.add(y);
  });
  const ys = Object.keys(years).map(Number);
  if (!ys.length) return;
  const y0 = Math.min(...ys), y1 = Math.max(...ys);
  const n = y1 - y0 + 1;
  const H = 86, padB = 18, padT = 12, plotH = H - padB - padT;
  const W = Math.max(560, Math.min(1040, n * 14));
  const max = Math.max(...Object.values(years));
  const bw = Math.min(24, Math.max(3, Math.floor(W / n) - 2));
  const step = W / n;
  let bars = "", ticks = "";
  for (let y = y0; y <= y1; y++) {
    const v = years[y] || 0;
    const x = (y - y0) * step + (step - bw) / 2;
    if (v) {
      const h = Math.max(2, (v / max) * plotH);
      const r = Math.min(4, bw / 2, h);
      bars += `<path d="M${x},${padT + plotH} v${-(h - r)} q0,${-r} ${r},${-r} h${bw - 2 * r} q${r},0 ${r},${r} v${h - r} z"
        fill="var(--ch)" data-y="${y}" data-v="${v}"${matchedYears.has(y) ? ' opacity="1"' : ' opacity="0.82"'}></path>`;
      if (v === max) bars += `<text x="${x + bw / 2}" y="${padT + plotH - h - 4}" text-anchor="middle"
        font-size="10.5" fill="var(--ink-2)" font-family="var(--sans)">${v}</text>`;
    }
    if (y % 10 === 0) {
      const tx = Math.max(16, Math.min(W - 16, (y - y0) * step + step / 2));
      ticks += `<text x="${tx}" y="${H - 4}" text-anchor="middle"
      font-size="10.5" fill="var(--muted)">${y}</text>`;
    }
  }
  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Concerts per year">
    <line x1="0" y1="${padT + plotH}" x2="${W}" y2="${padT + plotH}" stroke="var(--baseline)" stroke-width="1"/>
    ${bars}${ticks}
    <rect x="0" y="0" width="${W}" height="${H}" fill="transparent" id="tlhit"/></svg>
  <div class="viz-tip" id="tltip"></div>`;
  const svg = el.querySelector("svg"), tip = $("#tltip", el);
  svg.addEventListener("mousemove", (e) => {
    const rect = svg.getBoundingClientRect();
    const y = y0 + Math.floor(((e.clientX - rect.left) / rect.width) * n);
    const v = years[y] || 0;
    tip.textContent = `${y}: ${v} concert${v === 1 ? "" : "s"}`;
    tip.style.opacity = 1;
    tip.style.left = `${e.clientX + 12}px`;
    tip.style.top = `${e.clientY - 30}px`;
  });
  svg.addEventListener("mouseleave", () => { tip.style.opacity = 0; });
}

/* ---------------- event ---------------- */
async function eventPage(id) {
  const ev = await getJSON(`data/events/${id}.json`);
  const progHtml = ev.program.map((w) => {
    const perf = w.performers.map((p) => {
      const nm = p.qid ? `<a href="#/person/${p.qid}">${esc(p.name)}</a>` : esc(p.name || "?");
      return `${nm}${p.roles.length ? ` <span class="role">${esc(roleFmt(p.roles))}</span>` : ""}`;
    }).join(" · ");
    return `<div class="pitem">
      <div class="wt">${esc(w.label || w.work || "Untitled work")}</div>
      ${w.composer ? `<div class="wc">${esc(w.composer)}</div>` : ""}
      ${perf ? `<div class="perf">${perf}</div>` : ""}
    </div>`;
  }).join("");

  const quotesHtml = ev.quotes.map((q) => {
    const who = q.qid ? `<a href="#/person/${q.qid}">${esc(q.speaker)}</a>` : esc(q.speaker);
    const attrib = q.first_person === false
      ? `from the interview with ${who}` : who;
    return `
    <div class="quote">
      ${q.caption ? `<div class="cap">${esc(q.caption)}</div>` : ""}
      <blockquote>${hlCH(q.text)}</blockquote>
      <div class="meta">${SRC.lj}
        <span>${attrib} · ${esc(q.collection)}</span>
        <span class="matched">match confidence: ${esc(q.conf)}</span> ${SRC.ai}
        <a href="${esc(q.url)}" target="_blank" rel="noopener">original transcript at the archive ↗</a>
      </div>
    </div>`;
  }).join("");

  app.innerHTML = `
  <div class="wrap">
    <div class="crumb"><a href="#/concerts">← Featured concerts</a></div>
    <div class="event-head">
      <div class="ed">${fmtDate(ev.date ? ev.date.slice(0, 10) : null).toUpperCase()}${ev.date && ev.date.length > 10 ? ` · ${ev.date.slice(11)}` : ""}</div>
      <h1>${esc(ev.label || "Untitled event")}</h1>
      <div class="ev">${ev.venue ? esc(ev.venue) + " · " : ""}Carnegie Hall
        · <a href="http://data.carnegiehall.org/events/${esc(ev.id)}" target="_blank" rel="noopener">source record ↗</a></div>
    </div>

    ${quotesHtml ? `<div class="sec">
      <div class="sec-head"><h2>Voices about this night</h2><span class="n">oral-history memories pinned to this concert</span></div>
      ${quotesHtml}</div>` : ""}

    <div class="sec">
      <div class="sec-head"><h2>The program</h2><span class="n">${ev.program.length} work${ev.program.length === 1 ? "" : "s"} · ${SRC.ch}</span></div>
      <div class="program">${progHtml || '<p style="color:var(--muted)">No per-work program survives for this event.</p>'}</div>
    </div>

    ${ev.featured_people.length ? `<div class="sec">
      <div class="sec-head"><h2>On the bill &amp; in the archives</h2><span class="n">people from this program with oral-history records</span></div>
      <div class="chips">${ev.featured_people.map((p) =>
        `<a href="#/person/${p.qid}">${esc(p.name)}</a>`).join("")}</div></div>` : ""}
  </div>`;
}

/* ---------------- concerts list ---------------- */
async function concerts() {
  const evIdx = await getJSON("data/events_index.json");
  const rows = [...evIdx].sort((a, b) => (a.date || "").localeCompare(b.date || ""));
  app.innerHTML = `
  <div class="wrap">
    <h2 class="sect" style="margin-top:34px">Featured concerts</h2>
    <p class="sect-sub">${rows.length} events with full programs — nights remembered in the oral histories,
    plus the Carnegie Hall concerts with the most jazz-archive musicians on stage. ${SRC.ch}</p>
    ${rows.map((e) => `<div class="concert">
      <div class="cd">${esc(e.date || "—")}</div>
      <div class="cl"><a href="#/event/${e.id}">${esc(e.label || "Untitled event")}</a>
        ${e.quotes ? `<span class="pin">● ${e.quotes} ${e.quotes === 1 ? "memory" : "memories"}</span>` : ""}</div>
      <div class="cv">${e.venue ? esc(e.venue) + " · " : ""}${e.works} works · ${e.featured} matched musicians</div>
    </div>`).join("")}
  </div>`;
}

/* ---------------- memories timeline ---------------- */
async function memories() {
  const ms = await getJSON("data/memories.json");
  const idx = await getJSON("data/people_index.json");
  const thumbs = Object.fromEntries(idx.map((p) => [p.qid, p.thumb]));
  const byDecade = {};
  ms.forEach((m) => {
    const d = m.date ? `${m.date.slice(0, 3)}0s` : "Undated";
    (byDecade[d] = byDecade[d] || []).push(m);
  });
  app.innerHTML = `
  <div class="wrap">
    <h2 class="sect" style="margin-top:34px">A century of nights, remembered</h2>
    <p class="sect-sub">Each memory below was told in a jazz oral history and pinned to the documented
    Carnegie Hall concert it describes — the program on one side, the voice on the other.
    ${SRC.ch} ${SRC.lj} ${SRC.ai}</p>
    ${Object.entries(byDecade).map(([dec, list]) => `
      <div class="decade" style="font-size:15px">${dec}</div>
      ${list.map((m) => `
      <div class="quote" style="display:flex;gap:14px;align-items:flex-start">
        ${thumbs[m.qid] ? `<img src="${esc(thumbs[m.qid])}" alt="" loading="lazy" onerror="this.style.display='none'"
          style="width:52px;height:52px;border-radius:50%;object-fit:cover;flex:none;border:1px solid var(--grid)">` : ""}
        <div style="flex:1">
          <div class="cap">${fmtDate(m.date)} — <a href="#/event/${m.event_id}">${esc(m.event_label)}</a></div>
          ${m.caption ? `<div style="font-size:13px;color:var(--ink-2);margin-bottom:4px">${esc(m.caption)}</div>` : ""}
          <blockquote>${hlCH(snipCH(m.text))}</blockquote>
          <div class="meta">
            <span>${m.first_person === false ? "from the interview with " : ""}${m.qid ? `<a href="#/person/${m.qid}">${esc(m.speaker)}</a>` : esc(m.speaker)}</span>
            <span class="matched">${esc(m.conf)} confidence</span>
            <a href="${esc(m.url)}" target="_blank" rel="noopener">original transcript ↗</a>
            <a href="http://data.carnegiehall.org/events/${esc(m.event_id)}" target="_blank" rel="noopener">Carnegie Hall data record ↗</a>
          </div>
        </div>
      </div>`).join("")}`).join("")}
  </div>`;
}

/* ---------------- co-performers ---------------- */
let coperfState = { q: "", mode: "all" };
async function coperformers() {
  const [ps, idx] = await Promise.all([
    getJSON("data/coperformers.json"), getJSON("data/people_index.json"),
  ]);
  const thumbs = Object.fromEntries(idx.map((p) => [p.qid, p.thumb]));
  const nMut = ps.filter((p) => p.mutual).length;
  app.innerHTML = `
  <div class="wrap">
    <h2 class="sect" style="margin-top:34px">Co-performers, in each other's words</h2>
    <p class="sect-sub">${nfmt(ps.length)} pairs of musicians who played in the <b>same piece</b>
    on a documented Carnegie Hall program — and talked about each other in the oral histories.
    ${nfmt(nMut)} pairs are <b>mutual</b>: both told their side. ${SRC.ch} ${SRC.lj}</p>
    <div class="toolbar">
      <input type="search" id="cq" placeholder="Search a name…" value="${esc(coperfState.q)}">
      <span class="toggle">
        <button data-m="all">All pairs</button>
        <button data-m="mut">Mutual only</button>
      </span>
      <span class="count-note" id="cn"></span>
    </div>
    <div id="clist"></div>
    <button class="showmore" id="cmore" style="display:none">Show more</button>
    <button class="showmore" id="call" style="display:none">Show all</button>
  </div>`;

  const face = (qid, name) => {
    const ini = (name || "?").split(/\s+/).map((w) => w[0]).slice(0, 2).join("");
    return thumbs[qid]
      ? `<img src="${esc(thumbs[qid])}" alt="${esc(name || "")}" loading="lazy"
           onerror="this.outerHTML='<span class=face-ph>${esc(ini)}</span>'">`
      : `<span class="face-ph">${esc(ini)}</span>`;
  };
  const sparqlURL = (p) => {
    const q = `PREFIX mo: <http://purl.org/ontology/mo/>
PREFIX schema: <http://schema.org/>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>

# Every piece ${p.a_name} and ${p.b_name} performed together at Carnegie Hall
SELECT ?date ?concert ?piece WHERE {
  ?event schema:subEvent ?wp ;
         rdfs:label ?concert ;
         schema:startDate ?date .
  ?wp mo:performer <http://data.carnegiehall.org/names/${p.a_ch}> ,
                   <http://data.carnegiehall.org/names/${p.b_ch}> .
  OPTIONAL { ?wp rdfs:label ?piece }
}
ORDER BY ?date`;
    return "https://data.carnegiehall.org/sparql/?query=" + encodeURIComponent(q);
  };
  const card = (p) => {
    const names = { [p.a]: p.a_name, [p.b]: p.b_name };
    const span = p.y0 ? ` · ${p.y0 === p.y1 ? p.y0 : `${p.y0}–${p.y1}`}` : "";
    const stat = `Played together in ${nfmt(p.n_pieces)} piece${p.n_pieces === 1 ? "" : "s"}
      across ${nfmt(p.n_concerts)} Carnegie Hall concert${p.n_concerts === 1 ? "" : "s"}${span}
      · <a href="${esc(sparqlURL(p))}" target="_blank" rel="noopener"
           title="Opens Carnegie Hall's SPARQL query interface pre-filled with the co-performance query">their co-performances in CH SPARQL ↗</a>`;
    return `<div class="pair">
      <div class="pair-head">
        <span class="duo">${face(p.a, p.a_name)}${face(p.b, p.b_name)}</span>
        <div>
          <h3><a href="#/person/${p.a}">${esc(p.a_name)}</a> &amp; <a href="#/person/${p.b}">${esc(p.b_name)}</a>
            ${p.mutual ? '<span class="pin">● both told their side</span>' : ""}</h3>
          <div class="pair-stat">${stat}</div>
        </div>
      </div>
      ${p.quotes.map((q) => `
      <div class="quote">
        <div class="cap">${esc(names[q.by])} <span class="rel">on ${esc(names[q.about])} · ${esc(q.relation)}</span></div>
        <blockquote>${hlCH(q.text)}</blockquote>
        <div class="meta">${SRC.lj}<span>${esc(q.collection)} · ${esc(q.doc_title || "")}</span>
          ${q.url ? `<a href="${esc(q.url)}" target="_blank" rel="noopener">original transcript at the archive ↗</a>` : ""}</div>
      </div>`).join("")}
    </div>`;
  };

  const list = $("#clist"), qEl = $("#cq"), more = $("#cmore"), all = $("#call");
  let shown = 50;
  const render = () => {
    document.querySelectorAll(".toggle button").forEach((b) =>
      b.classList.toggle("on", b.dataset.m === coperfState.mode));
    let rows = ps;
    if (coperfState.mode === "mut") rows = rows.filter((p) => p.mutual);
    const q = coperfState.q.trim().toLowerCase();
    if (q) rows = rows.filter((p) =>
      (p.a_name || "").toLowerCase().includes(q) || (p.b_name || "").toLowerCase().includes(q));
    $("#cn").textContent = `${nfmt(rows.length)} pairs`;
    list.innerHTML = rows.slice(0, shown).map(card).join("");
    const hidden = rows.length > shown;
    more.style.display = all.style.display = hidden ? "" : "none";
    if (hidden) all.textContent = `Show all ${nfmt(rows.length)}`;
  };
  qEl.addEventListener("input", () => { coperfState.q = qEl.value; shown = 50; render(); });
  document.querySelectorAll(".toggle button").forEach((b) =>
    b.addEventListener("click", () => { coperfState.mode = b.dataset.m; shown = 50; render(); }));
  more.addEventListener("click", () => { shown += 100; render(); });
  all.addEventListener("click", () => { shown = Infinity; render(); });
  render();
}

/* ---------------- voices ---------------- */
let voiceState = { q: "", coll: "all" };
async function voices() {
  const vs = await getJSON("data/voices.json");
  const colls = [...new Set(vs.map((v) => v.collection))].sort();
  app.innerHTML = `
  <div class="wrap">
    <h2 class="sect" style="margin-top:34px">“Carnegie Hall” in the oral histories</h2>
    <p class="sect-sub">Every passage in 1,347 jazz interviews where someone says <b>Carnegie Hall</b> — ${vs.length} passages. ${SRC.lj}</p>
    <div class="toolbar">
      <input type="search" id="vq" placeholder="Search within passages…" value="${esc(voiceState.q)}">
      <select id="vc"><option value="all">All archives</option>
        ${colls.map((cn) => `<option value="${esc(cn)}">${esc(cn)}</option>`).join("")}</select>
      <span class="count-note" id="vn"></span>
    </div>
    <div id="vlist"></div>
    <button class="showmore" id="vmore" style="display:none">Show more</button>
    <button class="showmore" id="vall" style="display:none">Show all</button>
  </div>`;
  const list = $("#vlist"), qEl = $("#vq"), cEl = $("#vc"), more = $("#vmore"), all = $("#vall");
  cEl.value = voiceState.coll;
  let shown = 100;
  const hl = (t, q) => {
    const base = q ? esc(t).replace(new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "ig"), "<mark>$1</mark>") : esc(t);
    return base.replace(/Carnegie\s+Hall/gi, '<mark class="chq">$&</mark>');
  };
  const render = () => {
    let rows = vs;
    if (voiceState.coll !== "all") rows = rows.filter((v) => v.collection === voiceState.coll);
    const q = voiceState.q.trim();
    if (q) rows = rows.filter((v) => v.text.toLowerCase().includes(q.toLowerCase()) ||
      (v.interviewee || "").toLowerCase().includes(q.toLowerCase()));
    $("#vn").textContent = `${rows.length} passages`;
    const hidden = rows.length > shown;
    more.style.display = all.style.display = hidden ? "" : "none";
    if (hidden) all.textContent = `Show all ${nfmt(rows.length)}`;
    list.innerHTML = rows.slice(0, shown).map((v) => `
      <div class="voice-item">
        <div class="who">${v.qid ? `<a href="#/person/${v.qid}">${esc(v.interviewee)}</a>` : esc(v.interviewee || "Unknown")}
          ${v.speaker ? `<span style="color:var(--muted);font-weight:400"> · speaker “${esc(v.speaker)}”</span>` : ""}</div>
        <blockquote>${hl(v.text, q)}</blockquote>
        <div class="meta"><span>${esc(v.collection)}${v.year ? " · " + v.year : ""} · ${esc(v.doc_title || "")}</span>
          <a href="${esc(v.url)}" target="_blank" rel="noopener">original transcript at the archive ↗</a></div>
      </div>`).join("");
  };
  qEl.addEventListener("input", () => { voiceState.q = qEl.value; shown = 100; render(); });
  cEl.addEventListener("change", () => { voiceState.coll = cEl.value; shown = 100; render(); });
  more.addEventListener("click", () => { shown += 100; render(); });
  all.addEventListener("click", () => { shown = Infinity; render(); });
  render();
}

/* ---------------- about ---------------- */
async function about() {
  const meta = await getJSON("data/meta.json");
  const c = meta.counts;
  app.innerHTML = `
  <div class="wrap prose" style="padding-top:34px">
    <h2 style="margin-top:0">About this site</h2>
    <p><b>Carnegie Hall × Linked Jazz</b> is a mashup of two independently built datasets about the same
    musical world, joined where they overlap.</p>

    <h2>${SRC.ch}</h2>
    <p>The spine of the site. Carnegie Hall's <a href="https://github.com/CarnegieHall/linked-data"
    target="_blank" rel="noopener">Linked Open Data</a> (release ${meta.ch_release}, CC0 1.0) documents
    ${nfmt(c.ch_events_total)} events on its stages since 1891 — every program, work, performer, and role.
    All concert listings, programs, dates, venues, and repertoire shown here come from this dataset,
    and every event links back to its <code>data.carnegiehall.org</code> source record.</p>

    <h2>${SRC.lj}</h2>
    <p>The voices. A corpus of 1,347 jazz oral-history interviews from four archives
    (Hamilton College Jazz Archive, Smithsonian Jazz Oral Histories, Rutgers IJS, Tulane Hogan Archive),
    processed into a network of people and relationships and reconciled to Wikidata —
    a continuation of the <a href="https://linkedjazz.org" target="_blank" rel="noopener">Linked Jazz</a> project.
    Interview quotes link to the original transcript source at the holding institution.</p>

    <h2>${SRC.wiki}</h2>
    <p>The join key. Both datasets reconcile people to Wikidata QIDs: where the same QID appears in both,
    the person is linked — ${nfmt(c.qid_links ?? c.people)} people, of whom ${nfmt(c.interviewees)} are oral-history
    interviewees themselves. Portraits are sourced from Wikimedia Commons and the Linked Jazz
    Semlab collection (various licenses; click through the Wikidata link on each page for
    attribution). Short bios are English Wikipedia lead sentences.</p>
    ${c.name_links ? `<p><b>Name-based links.</b> A further ${nfmt(c.name_links)} people have no Wikidata ID
    in the Carnegie Hall data but were linked by exact name — accepted only when birth/death dates agree
    on both sides, or when a locally-run LLM judged the documented Carnegie Hall activity (era, roles,
    repertoire) consistent with the person's biography. These pages carry a visible note, and the full
    ledger with each decision's reasoning ships with the dataset (ch_lj_crosswalk_name.csv).</p>` : ""}

    <h2>${SRC.ai}</h2>
    <p>Some interview passages are <em>pinned</em> to a specific documented concert. These matches were
    suggested by a locally-run LLM (Qwen 3.6) that read each passage alongside the speaker's documented
    Carnegie Hall concert list, and they are always labeled with a confidence level. ${nfmt(c.quotes_judged)}
    passages were reviewed; ${nfmt(c.quotes_matched)} were matched. Treat them as leads, not facts —
    the archive source and the concert record are both one click away.</p>

    <h2>Caveats</h2>
    <ul>
      <li>Entity matching is imperfect in both source datasets; a wrong QID on either side produces a wrong join.</li>
      <li>The oral histories skew toward jazz; Carnegie Hall's archive covers all genres. Absence here is not absence from history.</li>
      <li>Transcripts contain OCR/ASR errors ("Byrd and Prez") — quotes are shown as transcribed.</li>
    </ul>
  </div>`;
}

route();
