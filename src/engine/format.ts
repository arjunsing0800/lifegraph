// LIFEGRAPH — client-side formatting + evidence helpers.
// Evidence language rules: never claim "same session/user/event".
// Allowed: "N minutes apart", "same date", "same city", "shared entity",
// "temporal proximity", "appears connected", "related activity window".
import type { ReceiptConnection, LifeReceipt } from "./types";

export function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("en-IN", {
    day: "numeric", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit", hour12: false,
    timeZone: "Asia/Kolkata",
  }) + " IST";
}

export function fmtDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
}

export function timeAgo(iso: string): string {
  const y = new Date(iso).getUTCFullYear();
  return String(y);
}

export function evidenceLines(c: ReceiptConnection): string[] {
  const out: string[] = [];
  const m = c.evidence.temporal.minutesApart;
  out.push(m === 0 ? "Logged at the same minute" : m < 60 ? `${m} minutes apart` : `${Math.floor(m / 60)}h ${m % 60}m apart — same activity window`);
  const loc = c.evidence.location;
  if (loc.sameCity && loc.cityA) out.push(`Same city — ${loc.cityA}`);
  else if (loc.sameRouteContext) out.push("Same commute corridor (shared route code)");
  else if (loc.sameCity === false && loc.cityA && loc.cityB) out.push(`Different places — ${loc.cityA} vs ${loc.cityB}`);
  else out.push("No shared place — linked by time & context");
  if (c.evidence.entity.sharedEntities.length)
    out.push(`Shared ${c.evidence.entity.sharedEntities.length > 1 ? "entities" : "entity"} — ${c.evidence.entity.sharedEntities.slice(0, 3).join(", ")}`);
  else out.push("No shared entity — different subjects, close in time");
  out.push(`Related activity — ${c.evidence.category.relationship}`);
  return out;
}

export function receiptSubtitle(r: LifeReceipt): string {
  const bits: string[] = [fmtDateTime(r.timestamp)];
  if (r.location?.city) bits.push(`${r.location.city}${r.location.state ? ", " + r.location.state : ""}`);
  if (r.amount != null) bits.push(`${r.currency || "₹"} ${Number(r.amount).toLocaleString("en-IN")}`);
  return bits.join("  ·  ");
}

export function strengthLabel(score: number): string {
  if (score >= 0.85) return "Very strong";
  if (score >= 0.65) return "Strong";
  return "Possible";
}
