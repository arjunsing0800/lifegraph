// LIFEGRAPH build-time data pipeline (Node, no deps).
// RAW CSVS (data/raw) -> generated JSON (src/data/generated).
// Deterministic: seeded RNG, reproducible output.
// Usage: node scripts/build-data.mjs
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const RAW = join(ROOT, "data", "raw");
const OUT = join(ROOT, "public", "data");
mkdirSync(OUT, { recursive: true });

// ---------- utils ----------
function stripBOM(s) {
  return s.charCodeAt(0) === 0xfeff ? s.slice(1) : s;
}
function parseCSV(text) {
  text = stripBOM(text);
  const rows = [];
  let cur = [""], inQ = false;
  // normalize newlines
  text = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') {
        if (text[i + 1] === '"') { cur[cur.length - 1] += '"'; i++; }
        else inQ = false;
      } else cur[cur.length - 1] += c;
    } else {
      if (c === '"') inQ = true;
      else if (c === ",") cur.push("");
      else if (c === "\n") { rows.push(cur); cur = [""]; }
      else cur[cur.length - 1] += c;
    }
  }
  if (cur.length > 1 || cur[0] !== "") rows.push(cur);
  const header = rows[0].map((h) => h.trim());
  return rows.slice(1).filter((x) => x.length > 1 || x[0].trim() !== "").map((vals) => {
    const o = {};
    header.forEach((h, i) => (o[h] = (vals[i] ?? "").trim()));
    return o;
  });
}
const normTok = (s) =>
  s.toLowerCase().replace(/[^a-z0-9\s-]/g, " ").split(/[\s-]+/).filter((t) => t.length >= 3 && !/^\d+$/.test(t));
function normEntity(s) {
  return s.toLowerCase().trim().replace(/\s+/g, " ");
}
function todTag(h) {
  if (h >= 0 && h < 5) return "night-owl";
  if (h >= 5 && h < 12) return "morning";
  if (h >= 12 && h < 17) return "afternoon";
  if (h >= 17 && h < 22) return "evening";
  return "late-night";
}
// Protagonist is India-based (INR household ledger): time-of-day is IST (UTC+5:30).
// Spotify ts = UTC, household stored as UTC converted from IST — both mapped back.
const istHour = (ms) => new Date(ms + 5.5 * 3600000).getUTCHours();
const istDay = (ms) => new Date(ms + 5.5 * 3600000).getUTCDay();
const istDate = (ms) => new Date(ms + 5.5 * 3600000).getUTCDate();
function todLabel(h) {
  if (h >= 0 && h < 5) return "Night";
  if (h >= 5 && h < 12) return "Morning";
  if (h >= 12 && h < 17) return "Afternoon";
  if (h >= 17 && h < 22) return "Evening";
  return "Late night";
}

// ---------- 1. SPOTIFY ----------
console.log("parsing spotify...");
const spotRows = parseCSV(readFileSync(join(RAW, "spotify_history.csv"), "utf8"));
console.log("  rows:", spotRows.length);
let spotValid = [];
for (const r of spotRows) {
  const ms = parseInt(r.ms_played, 10);
  if (!Number.isFinite(ms) || ms <= 30000) continue;
  const ts = new Date(r.ts.replace(" ", "T") + "Z");
  if (isNaN(ts)) continue;
  spotValid.push({ r, ms, t: ts.getTime() });
}
console.log("  valid (>30s):", spotValid.length, `(${(100 * spotValid.length / spotRows.length).toFixed(1)}%)`);
const artistCounts = new Map();
for (const s of spotValid) artistCounts.set(s.r.artist_name, (artistCounts.get(s.r.artist_name) || 0) + 1);

// session-based stratified sample: preserves listening-session adjacency so the
// connection engine can discover real sessions (top-N sampling would shred them).
// Sessions = plays with gaps <= 45 min. Per ISO week: best session first, fill to
// ~10 tracks with the next-best session. Deterministic.
const weekOf = (t) => {
  const d = new Date(t);
  const onejan = Date.UTC(d.getUTCFullYear(), 0, 1);
  return d.getUTCFullYear() + "-w" + Math.ceil(((t - onejan) / 86400000 + onejanDay(onejan)) / 7);
};
function onejanDay(onejan) {
  return new Date(onejan).getUTCDay() || 7;
}
spotValid.sort((a, b) => a.t - b.t);
const sessions = [];
{
  let cur = [spotValid[0]];
  for (let i = 1; i < spotValid.length; i++) {
    if (spotValid[i].t - spotValid[i - 1].t > 45 * 60000) { sessions.push(cur); cur = []; }
    cur.push(spotValid[i]);
  }
  sessions.push(cur);
}
const sessByWeek = new Map();
for (const s of sessions) {
  const w = weekOf(s[0].t);
  if (!sessByWeek.has(w)) sessByWeek.set(w, []);
  sessByWeek.get(w).push(s);
}
function sessScore(s) {
  const h = istHour(s[0].t);
  let sc = 0;
  if (h >= 17 || h < 5) sc += 3; // evening/night life (IST)
  if (s.length >= 4 && s.length <= 24) sc += 2;
  const skipRatio = s.filter((x) => x.r.skipped === "TRUE").length / s.length;
  if (skipRatio < 0.3) sc += 1;
  return sc;
}
let spotSampled = [];
for (const [, arr] of sessByWeek) {
  arr.sort((a, b) => sessScore(b) - sessScore(a) || a[0].t - b[0].t);
  const picked = [];
  for (const s of arr) {
    if (picked.length >= 10) break;
    const take = s.slice(0, 20);
    for (const x of take) {
      if (picked.length >= 10) break;
      picked.push(x);
    }
  }
  spotSampled.push(...picked);
}
spotSampled.sort((a, b) => a.t - b.t);
console.log("  sessions:", sessions.length, "weeks:", sessByWeek.size, "sampled:", spotSampled.length);

const spotReceipts = spotSampled.map((s, i) => {
  const r = s.r;
  const d = new Date(s.t);
  const h = istHour(s.t); // IST
  return {
    id: `sp-${i}`,
    type: "music",
    timestamp: d.toISOString(),
    title: `${r.track_name} — ${r.artist_name}`,
    description: `${r.album_name} · ${Math.round(s.ms / 60000)} min · ${r.platform}`,
    location: undefined,
    // prefixed entities: artist:/album: are identity signals (scoring bonus),
    // bare tokens are free text for Jaccard matching
    entities: [...new Set([`artist:${normEntity(r.artist_name)}`, `album:${normEntity(r.album_name)}`, ...normTok(r.track_name)].filter((e) => e !== "artist:" && e !== "album:") )].slice(0, 8),
    tags: [todTag(h), r.platform.replace(/\s+/g, "-").toLowerCase(), r.skipped === "TRUE" ? "skipped" : "played-through", istDay(s.t) === 0 || istDay(s.t) === 6 ? "weekend" : "weekday"],
    source: "spotify",
    sourceId: r.spotify_track_uri,
    metadata: { msPlayed: s.ms, platform: r.platform, skipped: r.skipped === "TRUE" },
  };
});

// ---------- 2. HOUSEHOLD ----------
console.log("parsing household...");
const hhRows = parseCSV(readFileSync(join(RAW, "household_transactions.csv"), "utf8"));
console.log("  rows:", hhRows.length);
function parseHouseholdDate(s) {
  s = s.trim();
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (!m) return null;
  const [, dd, mm, yyyy, HH = "12", MM = "00", SS = "00"] = m;
  // DD/MM/YYYY (Indian dataset), recorded in IST -> convert to UTC
  const ist = Date.UTC(+yyyy, +mm - 1, +dd, +HH, +MM, +SS);
  return new Date(ist - 5.5 * 3600000);
}
const routeRe = /place\s*\d+/gi;
const hhReceipts = [];
const hhCatCounts = new Map();
let hhSkipped = 0;
hhRows.forEach((r, i) => {
  const dt = parseHouseholdDate(r.Date);
  if (!dt) { hhSkipped++; return; }
  const cat = (r.Category || "").trim(), sub = (r.Subcategory || "").trim(), note = (r.Note || "").trim();
  const io = (r["Income/Expense"] || "").trim();
  const amt = parseFloat(r.Amount);
  hhCatCounts.set(cat || "(blank)", (hhCatCounts.get(cat || "(blank)") || 0) + 1);
  let type = "purchase";
  const tags = [io.toLowerCase().replace(/[^a-z]+/g, "-") || "expense"];
  if (cat === "Culture" && /movie/i.test(sub)) { type = "movie"; tags.push("cinema"); }
  else if (cat === "subscription" && /netflix|tata sky|amazon prime/i.test(sub + " " + note)) { type = "movie"; tags.push("subscription"); }
  else if (cat === "Festivals") { type = "event"; tags.push("festival"); }
  else if (cat === "Tourism" || /planetarium/i.test(note)) { type = "event"; tags.push("outing"); }
  else if (/marathon/i.test(note) || /marathon/i.test(sub)) { type = "event"; tags.push("fitness"); }
  if (cat === "Transportation") tags.push("transit");
  if (/salary/i.test(cat + sub)) tags.push("salary");
  if (/mutual fund|provident|investment|recurring deposit|share market|insurance/i.test(cat + sub)) tags.push("investment");
  if (/money transfer|home/i.test(cat + sub) && /home/i.test(sub + note)) tags.push("family-support");
  const h = istHour(dt.getTime()); // IST
  tags.push(todTag(h));
  const routes = (note.match(routeRe) || []).map((x) => x.toLowerCase().replace(/\s+/g, "-"));
  for (let ri = 0; ri < routes.length; ri++) tags.push("route");
  const entities = [...new Set([...normTok(cat), ...normTok(sub), ...normTok(note), ...routes].filter(Boolean))].slice(0, 10);
  hhReceipts.push({
    id: `hh-${i}`,
    type,
    timestamp: dt.toISOString(),
    title: note ? `${note} · ₹${r.Amount}` : `${cat}${sub ? " · " + sub : ""} · ₹${r.Amount}`,
    description: `${cat}${sub ? " / " + sub : ""} · ${r.Mode} · ${io}`,
    amount: Number.isFinite(amt) ? amt : undefined,
    currency: r.Currency || "INR",
    location: undefined, // anonymized "Place N" — kept as route context, never geocoded
    entities,
    tags,
    source: "household",
    sourceId: `row-${i}`,
    metadata: { mode: r.Mode, io, route: routes.length ? routes : undefined },
  });
});
console.log("  kept:", hhReceipts.length, "skipped:", hhSkipped);

// ---------- 3. AUGMENTED (crowd context — 1448 personas, NOT one life) ----------
console.log("parsing augmented...");
const augRows = parseCSV(readFileSync(join(RAW, "Augmented_IndiaTransactMultiFacet2024.csv"), "utf8"));
console.log("  rows:", augRows.length);
function parseAugDate(s) {
  s = (s || "").trim();
  if (!s) return null;
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2}))?/);
  if (!m) return null;
  const [, a, b, yyyy, HH = "12", MM = "00"] = m;
  // ambiguous M/D vs D/M; dataset mixes — use: if first>12 treat as day
  let mm = +a, dd = +b;
  if (mm > 12) { dd = +a; mm = +b; }
  const d = new Date(Date.UTC(+yyyy, mm - 1, dd, +HH, +MM));
  return isNaN(d) ? null : d;
}
const augCatCounts = new Map();
const augValid = [];
for (const r of augRows) {
  const dt = parseAugDate(r.trans_date_trans_time);
  if (!dt || !r.city.trim()) continue;
  augValid.push({ r, t: dt.getTime() });
  augCatCounts.set(r.category || "(blank)", (augCatCounts.get(r.category || "(blank)") || 0) + 1);
}
console.log("  valid (date+city):", augValid.length);
// stratified sample ~500/category
const augByCat = new Map();
for (const a of augValid) {
  const k = a.r.category || "(blank)";
  if (!augByCat.has(k)) augByCat.set(k, []);
  augByCat.get(k).push(a);
}
let augSampled = [];
for (const [, arr] of augByCat) {
  // deterministic stride sample
  const cap = 500;
  if (arr.length <= cap) augSampled.push(...arr);
  else {
    const stride = arr.length / cap;
    for (let k = 0; k < cap; k++) augSampled.push(arr[Math.floor(k * stride)]);
  }
}
console.log("  sampled:", augSampled.length);
const augCatType = { entertainment: "movie", travel: "purchase", online_shopping: "purchase", fitness_and_medical: "purchase" };
const augReceipts = augSampled.map((a, i) => {
  const r = a.r;
  const d = new Date(a.t);
  const amt = parseFloat(r.amt);
  return {
    id: `ag-${i}`,
    type: augCatType[r.category] || "purchase",
    timestamp: d.toISOString(),
    title: `${(r.merchant || "Unknown merchant").replace(/^fraud_/i, "")} · ₹${r.amt || "?"}`,
    description: `${r.category || "transaction"} · ${r.city}, ${r.state} · city activity (aggregate personas)`,
    amount: Number.isFinite(amt) ? amt : undefined,
    currency: "INR",
    location: { city: r.city, state: r.state || undefined, country: "India" }, // textual only — coords excluded (1.4% India-valid)
    entities: [...new Set([...normTok(r.merchant.replace(/^fraud_/i, "")), ...normTok(r.category), normEntity(r.city), ...normTok(r.job)].filter(Boolean))].slice(0, 8),
    tags: ["crowd-context", (r.category || "misc").replace(/_/g, "-"), todTag(d.getUTCHours())],
    source: "augmented",
    sourceId: r.trans_id || `row-${i}`,
    metadata: { coordsExcluded: true },
  };
});

// ---------- 4. UNIFIED ----------
let unified = [...spotReceipts, ...hhReceipts, ...augReceipts];
unified.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
console.log("unified:", unified.length, "range:", unified[0].timestamp, "->", unified[unified.length - 1].timestamp);

// ---------- 5. CONNECTIONS ----------
const W_TEMP = 0.4, W_LOC = 0.25, W_ENT = 0.2, W_CAT = 0.15;
const WINDOW_MS = 120 * 60000;
const CAT_REL = new Map([
  ["music|purchase", 0.8], ["music|movie", 0.7], ["music|event", 0.8], ["music|place", 0.6],
  ["purchase|place", 0.8], ["purchase|event", 0.6], ["movie|event", 0.8], ["purchase|movie", 0.7],
  ["music|music", 0.5], ["purchase|purchase", 0.4], ["movie|movie", 0.6], ["event|event", 0.6],
  ["place|place", 0.5],
]);
function catRel(a, b) {
  if (a === b) {
    const k = `${a}|${a}`;
    return CAT_REL.has(k) ? CAT_REL.get(k) : 0.3;
  }
  const k1 = `${a}|${b}`, k2 = `${b}|${a}`;
  return CAT_REL.get(k1) ?? CAT_REL.get(k2) ?? 0.2;
}
function catLabel(a, b) {
  return a === b ? `${a} → ${b} (same activity)` : `${a} → ${b}`;
}
const times = unified.map((r) => Date.parse(r.timestamp));
const entSets = unified.map((r) => new Set(r.entities));
function jaccard(A, B) {
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  return inter / (A.size + B.size - inter);
}
function routeTokens(r) {
  return r.entities.filter((e) => /^place-\d+$/.test(e));
}
const connections = [];
let candidates = 0;
for (let i = 0; i < unified.length; i++) {
  const A = unified[i];
  let neighbors = 0;
  for (let j = i + 1; j < unified.length && times[j] - times[i] <= WINDOW_MS && neighbors < 60; j++) {
    const B = unified[j];
    // DATA-TRUTH: augmented rows are 1448 distinct synthetic personas — never link
    // crowd-context receipts to each other (that would fabricate a single life).
    if (A.source === "augmented" && B.source === "augmented") continue;
    const mins = (times[j] - times[i]) / 60000;
    // prefilter: shared entity OR same city OR shared route OR compatible category
    const shared = [...entSets[i]].filter((e) => entSets[j].has(e));
    const cityA = A.location?.city?.toLowerCase(), cityB = B.location?.city?.toLowerCase();
    const sameCity = !!cityA && !!cityB && cityA === cityB;
    const rA = routeTokens(A), rB = routeTokens(B);
    const sameRoute = rA.length > 0 && rB.length > 0 && rA.some((x) => rB.includes(x));
    const compat = catRel(A.type, B.type) >= 0.4;
    if (!shared.length && !sameCity && !sameRoute && !compat) continue;
    candidates++;
    neighbors++;
    const timeScore = Math.max(0, 1 - mins / 120);
    let locScore, locEv;
    if (sameCity) { locScore = 1; locEv = { sameCity: true, cityA: A.location.city, cityB: B.location.city, score: 1 }; }
    else if (sameRoute) { locScore = 1; locEv = { sameRouteContext: true, score: 1 }; }
    else if ((cityA && !cityB) || (!cityA && cityB) || (!cityA && !cityB)) { locScore = 0.35; locEv = { score: 0.35 }; }
    else { locScore = 0; locEv = { sameCity: false, cityA: A.location.city, cityB: B.location.city, score: 0 }; }
    const entScoreRaw = shared.length ? jaccard(entSets[i], entSets[j]) : (entSets[i].size === 0 && entSets[j].size === 0 ? 0.15 : 0);
    // same-artist continuity: adjacent plays by one artist are one listening session
    const shareArtist = shared.some((e) => e.startsWith("artist:"));
    const entScore = shareArtist ? Math.max(entScoreRaw, 0.55) : entScoreRaw;
    const cr = catRel(A.type, B.type);
    let score = timeScore * W_TEMP + locScore * W_LOC + entScore * W_ENT + cr * W_CAT;
    // cross-source guard: time-only links across sources can't be "strong"
    if (A.source !== B.source && !shared.length && !sameCity && !sameRoute && score > 0.6) score = 0.6;
    if (score < 0.55) continue;
    connections.push({
      id: `c-${connections.length}`,
      receiptA: A.id, receiptB: B.id,
      score: Math.round(score * 100) / 100,
      evidence: {
        temporal: { minutesApart: Math.round(mins), score: Math.round(timeScore * 100) / 100 },
        location: locEv,
        entity: { sharedEntities: shared.slice(0, 5), score: Math.round(entScore * 100) / 100 },
        category: { relationship: catLabel(A.type, B.type), score: cr },
      },
    });
  }
}
connections.sort((a, b) => b.score - a.score);
const strong = connections.filter((c) => c.score >= 0.65);
console.log(`candidates: ${candidates}, connections>=0.55: ${connections.length}, strong>=0.65: ${strong.length}`);
console.log("score distribution:",
  [0.55, 0.65, 0.75, 0.85].map((t) => `>=${t}:${connections.filter((c) => c.score >= t).length}`).join(" "));
console.log("top connections:", connections.slice(0, 5).map((c) => `${c.receiptA}<->${c.receiptB} ${c.score}`).join(" | "));

// ---------- 6. CLUSTERS (union-find on strong edges, split on >90min gaps) ----------
const parent = new Map(unified.map((r) => [r.id, r.id]));
const find = (x) => (parent.get(x) === x ? x : parent.set(x, find(parent.get(x))).get(x));
const union = (a, b) => parent.set(find(a), find(b));
for (const c of strong) union(c.receiptA, c.receiptB);
const groups = new Map();
for (const r of unified) {
  const root = find(r.id);
  if (!groups.has(root)) groups.set(root, []);
  groups.get(root).push(r);
}
const byId = new Map(unified.map((r) => [r.id, r]));
let moments = [];
let mi = 0;
for (const [, members] of groups) {
  if (members.length < 3) continue;
  members.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  // split on internal gaps > 90 min
  let chunk = [members[0]];
  const chunks = [];
  for (let k = 1; k < members.length; k++) {
    if (Date.parse(members[k].timestamp) - Date.parse(members[k - 1].timestamp) > 90 * 60000) {
      chunks.push(chunk); chunk = [];
    }
    chunk.push(members[k]);
  }
  chunks.push(chunk);
  for (const ch of chunks) {
    if (ch.length < 3) continue;
    const chIds = new Set(ch.map((r) => r.id));
    const internalStrong = strong.filter((c) => chIds.has(c.receiptA) && chIds.has(c.receiptB));
    // a moment must contain its own evidence: drop fragments split off transitively
    if (!internalStrong.length) continue;
    const cids = internalStrong.map((c) => c.id);
    const t0 = Date.parse(ch[0].timestamp), t1 = Date.parse(ch[ch.length - 1].timestamp);
    const typeCount = new Map(), entCount = new Map(), cityCount = new Map();
    for (const r of ch) {
      typeCount.set(r.type, (typeCount.get(r.type) || 0) + 1);
      for (const e of r.entities) entCount.set(e, (entCount.get(e) || 0) + 1);
      if (r.location?.city) cityCount.set(r.location.city, (cityCount.get(r.location.city) || 0) + 1);
    }
    const domTypes = [...typeCount.entries()].sort((a, b) => b[1] - a[1]).map((x) => x[0]);
    const topEnt = [...entCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map((x) => x[0].replace(/^(artist|album):/, ""));
    const topCity = [...cityCount.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    const hh = istHour((t0 + t1) / 2); // IST
    moments.push({
      id: `m-${mi++}`,
      receiptIds: ch.map((r) => r.id),
      connectionIds: cids,
      centroidTime: new Date((t0 + t1) / 2).toISOString(),
      centroidLocation: topCity ? { city: topCity } : undefined,
      topEntities: topEnt,
      dominantTypes: domTypes,
      durationMinutes: Math.round((t1 - t0) / 60000),
      receiptCount: ch.length,
      categoryCount: new Set(ch.map((r) => r.type)).size,
      title: `${todLabel(hh)} · ${domTypes.slice(0, 2).join(" + ")}${topEnt[0] ? " · " + topEnt[0] : ""}${topCity ? " · " + topCity : ""}`,
      summary: `${ch.length} receipts across ${Math.max(1, Math.round((t1 - t0) / 60000))} minutes, spanning ${new Set(ch.map((r) => r.type)).size} activity types.`,
    });
  }
}
moments.sort((a, b) => b.receiptCount - a.receiptCount);
console.log("clusters:", moments.length, "sizes:", moments.slice(0, 8).map((m) => m.receiptCount).join(","));
if (moments.length) console.log("top cluster:", JSON.stringify(moments[0], null, 1).slice(0, 600));

// ---------- 7. PATTERNS ----------
const patterns = [];
const hourHist = (list) => {
  const h = new Array(24).fill(0);
  for (const r of list) h[istHour(Date.parse(r.timestamp))]++;
  return h;
};
// P1 night owl (spotify full corpus)
{
  const h = hourHist(spotValid.map((s) => ({ timestamp: new Date(s.t).toISOString() })));
  const tot = h.reduce((a, b) => a + b, 0);
  const night = h.slice(22).concat(h.slice(0, 5)).reduce((a, b) => a + b, 0) / tot;
  if (night > 0.2) patterns.push({
    id: "p-night-owl", type: "temporal", title: "The Night-Owl Signal",
    description: `${Math.round(night * 100)}% of all ${spotValid.length.toLocaleString()} track plays fall between 10 PM and 5 AM IST. Late-night listening is unusually frequent.`,
    strength: Math.round(Math.min(1, night * 2.2) * 100) / 100,
    evidenceReceiptIds: spotReceipts.filter((r) => { const hh2 = istHour(Date.parse(r.timestamp)); return hh2 >= 22 || hh2 < 5; }).slice(0, 20).map((r) => r.id),
    supportingStats: { nightShare: Math.round(night * 1000) / 10 + "%", totalPlays: spotValid.length },
  });
}
// P2 weekend vs weekday (household)
{
  let we = 0, wd = 0;
  for (const r of hhReceipts) { if (istDay(Date.parse(r.timestamp)) % 6 === 0) we++; else wd++; }
  patterns.push({
    id: "p-week-rhythm", type: "temporal", title: "Weekday Spending, Weekend Living",
    description: `${we} of ${hhReceipts.length} household records fall on weekends — routine spending clusters on weekdays while event-type records appear near weekends.`,
    strength: 0.62,
    evidenceReceiptIds: hhReceipts.filter((r) => r.type === "event").slice(0, 12).map((r) => r.id),
    supportingStats: { weekendRecords: we, weekdayRecords: wd },
  });
}
// P3 top artist concentration (recurrence)
{
  const top = [...artistCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  const topShare = top.reduce((a, x) => a + x[1], 0) / spotValid.length;
  patterns.push({
    id: "p-top-artists", type: "recurrence", title: "A Small Circle of Sound",
    description: `Just 5 artists — ${top.map((t) => t[0]).join(", ")} — account for ${Math.round(topShare * 100)}% of all plays. The Beatles alone: ${artistCounts.get("The Beatles").toLocaleString()} plays.`,
    strength: Math.round(Math.min(1, topShare * 3) * 100) / 100,
    evidenceReceiptIds: spotReceipts.filter((r) => top.some((t) => r.title.includes(t[0]))).slice(0, 20).map((r) => r.id),
    supportingStats: Object.fromEntries(top.map(([k, v]) => [k, v])),
  });
}
// P4 taste shift 2015-16 vs 2017-18
{
  const early = spotValid.filter((s) => s.t < Date.UTC(2017, 0, 1));
  const late = spotValid.filter((s) => s.t >= Date.UTC(2017, 0, 1) && s.t < Date.UTC(2019, 0, 1));
  const topN = (arr, n) => {
    const m = new Map();
    for (const s of arr) m.set(s.r.artist_name, (m.get(s.r.artist_name) || 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
  };
  if (early.length > 500 && late.length > 500) {
    const e = topN(early, 5), l = topN(late, 5);
    const overlap = e.filter(([a]) => l.some(([b]) => b === a)).length;
    patterns.push({
      id: "p-taste-shift", type: "shift", title: "The Sound Moved On",
      description: `Comparing 2015–16 (${early.length.toLocaleString()} plays) with 2017–18 (${late.length.toLocaleString()} plays): only ${overlap} of the top-5 artists overlap. Early: ${e.map((x) => x[0]).join(", ")}. Later: ${l.map((x) => x[0]).join(", ")}.`,
      strength: Math.round((1 - overlap / 5) * 100) / 100,
      evidenceReceiptIds: [],
      supportingStats: { earlyPlays: early.length, latePlays: late.length, top5Overlap: overlap },
    });
  }
}
// P5 first-of-month money ritual (household)
{
  const dom = new Array(32).fill(0);
  const ritualCats = new Set();
  for (const r of hhReceipts) {
    if (!/salary|investment|family-support|money|transfer|provident|mutual|recurring/i.test(r.tags.join(" ") + r.description)) continue;
    dom[istDate(Date.parse(r.timestamp))]++;
    ritualCats.add(r.title.slice(0, 40));
  }
  const firstWeek = dom.slice(1, 8).reduce((a, b) => a + b, 0);
  const tot = dom.reduce((a, b) => a + b, 0);
  if (tot > 20 && firstWeek / tot > 0.4) patterns.push({
    id: "p-month-ritual", type: "cross-type", title: "The First-of-Month Money Ritual",
    description: `${Math.round((firstWeek / tot) * 100)}% of salary, investment and family-support records land in the first 7 days of the month — pay arrives, investments leave, money goes home.`,
    strength: Math.round((firstWeek / tot) * 100) / 100,
    evidenceReceiptIds: hhReceipts.filter((r) => istDate(Date.parse(r.timestamp)) <= 7 && /salary|investment|family-support/i.test(r.tags.join(" "))).slice(0, 16).map((r) => r.id),
    supportingStats: { firstWeekRecords: firstWeek, totalMoneyRecords: tot },
  });
}
// P6 transit routes recurrence
{
  const routeCount = new Map();
  for (const r of hhReceipts) for (const e of r.entities) if (/^place-\d+$/.test(e)) routeCount.set(e, (routeCount.get(e) || 0) + 1);
  const top = [...routeCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
  if (top.length && top[0][1] >= 10) patterns.push({
    id: "p-transit", type: "recurrence", title: "Life in Motion",
    description: `The same anonymized stops recur constantly — ${top.map(([k, v]) => `${k} ×${v}`).join(", ")}. Commute corridors, not one-off trips.`,
    strength: 0.78,
    evidenceReceiptIds: hhReceipts.filter((r) => r.entities.some((e) => e === top[0][0])).slice(0, 16).map((r) => r.id),
    supportingStats: Object.fromEntries(top),
  });
}
// P7 music+food evenings (cross-type, overlap window)
{
  const pairs = [];
  for (const c of connections) {
    const A = byId.get(c.receiptA), B = byId.get(c.receiptB);
    if (!A || !B) continue;
    const types = new Set([A.type, B.type]);
    if (types.has("music") && (types.has("purchase") || types.has("movie"))) {
      const hh3 = istHour(Date.parse(A.timestamp)); // IST
      if (hh3 >= 17 || hh3 < 2) pairs.push(c);
    }
  }
  const dates = new Set(pairs.map((c) => byId.get(c.receiptA).timestamp.slice(0, 10)));
  if (pairs.length >= 8 && dates.size >= 4) patterns.push({
    id: "p-evening-ritual", type: "cross-type", title: "Music Evenings, With Food Nearby",
    description: `${pairs.length} music↔food/entertainment links appear in evening windows across ${dates.size} distinct dates — listening and eating keep showing up together after 5 PM.`,
    strength: Math.round(Math.min(1, dates.size / 12) * 100) / 100,
    evidenceReceiptIds: pairs.slice(0, 16).flatMap((c) => [c.receiptA, c.receiptB]).slice(0, 20),
    supportingStats: { eveningLinks: pairs.length, distinctDates: dates.size },
  });
}
console.log("patterns:", patterns.map((p) => `${p.id}(${p.strength})`).join(" "));

// ---------- 8. STORIES (from patterns + moments) ----------
const stories = [];
function momentFor(receiptIds) {
  const set = new Set(receiptIds);
  return moments.filter((m) => m.receiptIds.some((id) => set.has(id))).slice(0, 3).map((m) => m.id);
}
const byPid = new Map(patterns.map((p) => [p.id, p]));
function addStory(id, title, description, pids, extraIds, kind, evidence) {
  const rids = [...new Set(pids.flatMap((p) => byPid.get(p)?.evidenceReceiptIds || []).concat(extraIds || []))].slice(0, 24);
  if (!rids.length) return;
  stories.push({
    id, title, description, receiptIds: rids, clusterIds: momentFor(rids),
    patternType: kind,
    strength: Math.round((pids.reduce((a, p) => a + (byPid.get(p)?.strength || 0), 0) / Math.max(1, pids.length)) * 100) / 100,
    evidence,
  });
}
addStory("s-night", "The Night Pattern",
  "Across a decade of listening, the same late window keeps lighting up — track after track, night after night. The receipts cluster there on their own.",
  ["p-night-owl"], moments.filter((m) => /night|late/i.test(m.title)).slice(0, 2).flatMap((m) => m.receiptIds), "ritual",
  [{ label: "Night-share of plays", value: String(byPid.get("p-night-owl")?.supportingStats.nightShare || "") }, { label: "Life moments at night", value: String(moments.filter((m) => /night|late/i.test(m.title)).length) }]);
addStory("s-taste", "A Change in Taste",
  "The top of the charts did not stay still. Comparing 2015–16 with 2017–18, the most-played artists turned over — a listening life moving into a new era.",
  ["p-taste-shift", "p-top-artists"], [], "shift",
  [{ label: "Top-5 overlap", value: String(byPid.get("p-taste-shift")?.supportingStats.top5Overlap ?? "") + " / 5" }, { label: "Beatles plays (all time)", value: Number(artistCounts.get("The Beatles") || 0).toLocaleString() }]);
addStory("s-month", "Payday, Invested, Sent Home",
  "Every month opens the same way: salary lands, investments leave automatically, and money travels home. Three movements, same week, month after month.",
  ["p-month-ritual"], [], "ritual",
  [{ label: "First-week share", value: Math.round((byPid.get("p-month-ritual")?.strength || 0) * 100) + "%" }]);
addStory("s-motion", "The Commute Corridors",
  "The same stops appear hundreds of times — train platforms and auto stands between anonymized Place codes. The city shrinks to a few well-worn lines.",
  ["p-transit"], moments.filter((m) => /place/i.test(m.topEntities.join(" ")) || /transit/i.test(m.title)).slice(0, 2).flatMap((m) => m.receiptIds), "recurrence",
  [{ label: "Most-visited stop", value: Object.entries(byPid.get("p-transit")?.supportingStats || {})[0]?.join(" ×") || "" }]);
if (byPid.has("p-evening-ritual")) addStory("s-evening", "Evenings With a Soundtrack",
  "On scattered evenings across the years, music plays within minutes of food and entertainment records. Not every night — but too often to be coincidence.",
  ["p-evening-ritual"], [], "ritual",
  [{ label: "Evening links", value: String(byPid.get("p-evening-ritual")?.supportingStats.eveningLinks || "") }, { label: "Distinct dates", value: String(byPid.get("p-evening-ritual")?.supportingStats.distinctDates || "") }]);
console.log("stories:", stories.map((s) => s.id).join(" "));

// ---------- 9. WRITE (trimmed for static payload) ----------
const trimReceipt = (r) => ({
  id: r.id,
  type: r.type,
  timestamp: r.timestamp,
  title: r.title,
  // description dropped: UI reconstructs from title + tags + entities + metadata
  amount: r.amount,
  currency: r.currency,
  location: r.location,
  entities: r.entities.slice(0, 6),
  tags: r.tags,
  source: r.source,
  metadata: r.source === "spotify" ? { ms: r.metadata.msPlayed } : r.source === "household" ? { io: r.metadata.io } : undefined,
});
const keepConns = connections.slice(0, 3000);
writeFileSync(join(OUT, "unifiedReceipts.json"), JSON.stringify(unified.map(trimReceipt)));
writeFileSync(join(OUT, "connections.json"), JSON.stringify(keepConns));
writeFileSync(join(OUT, "clusters.json"), JSON.stringify(moments));
writeFileSync(join(OUT, "patterns.json"), JSON.stringify(patterns));
writeFileSync(join(OUT, "stories.json"), JSON.stringify(stories));
const topArtists = [...artistCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([name, plays]) => ({ name, plays }));
const topHH = [...hhCatCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([name, count]) => ({ name, count }));
const topAug = [...augCatCounts.entries()].sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count }));
const stats = {
  totalReceipts: unified.length,
  bySource: { spotify: spotReceipts.length, household: hhReceipts.length, augmented: augReceipts.length },
  byType: unified.reduce((m, r) => { m[r.type] = (m[r.type] || 0) + 1; return m; }, {}),
  timeMin: unified[0].timestamp, timeMax: unified[unified.length - 1].timestamp,
  yearsCovered: new Date(unified[unified.length - 1].timestamp).getUTCFullYear() - new Date(unified[0].timestamp).getUTCFullYear() + 1,
  fullCorpus: { spotifyPlays: spotRows.length, spotifyPlaysOver30s: spotValid.length, householdRows: hhRows.length, augmentedRows: augRows.length },
  topArtists, topHouseholdCategories: topHH, topAugmentedCategories: topAug,
  connectionCount: connections.length, strongConnectionCount: strong.length,
  clusterCount: moments.length, patternCount: patterns.length, storyCount: stories.length,
  locationNote: "Augmented coordinates excluded: only 1.4% fall inside India. City/state kept as text. Household 'Place N' codes kept as route context, never geocoded. Map intentionally omitted.",
  samplingNote: `Visual corpus is a deterministic stratified sample (${unified.length} receipts). Global statistics computed from the full corpus (${spotRows.length + hhRows.length + augRows.length} rows).`,
};
writeFileSync(join(OUT, "stats.json"), JSON.stringify(stats, null, 1));
console.log("WROTE", OUT);
console.log(JSON.stringify({ unified: unified.length, conns: keepConns.length, clusters: moments.length, patterns: patterns.length, stories: stories.length }));
