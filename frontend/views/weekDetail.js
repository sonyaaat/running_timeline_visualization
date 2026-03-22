import APP_STATE from "../js/state.js";
import { phaseColor, phaseTextColor } from "../js/colors.js";
import { formatPace } from "../js/utils.js";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// ── Percentile helper ──────────────────────────────────────
function percentile(sorted, pct) {
  return sorted[Math.floor(sorted.length * pct)] ?? sorted[sorted.length - 1];
}

// Build thresholds once from all activities
function buildThresholds(activities) {
  const runs = (activities || []).filter(a => a.type === "Run");

  const hrSorted = runs
    .filter(a => a.average_heartrate)
    .map(a => a.average_heartrate)
    .sort((a, b) => a - b);

  const distSorted = runs
    .map(a => a.distance / 1000)
    .sort((a, b) => a - b);

  return {
    hr: {
      easy:      hrSorted.length ? percentile(hrSorted, 0.25) : 140,
      aerobic:   hrSorted.length ? percentile(hrSorted, 0.50) : 155,
      tempo:     hrSorted.length ? percentile(hrSorted, 0.75) : 165,
      threshold: hrSorted.length ? percentile(hrSorted, 0.90) : 173,
    },
    dist: {
      short: distSorted.length ? percentile(distSorted, 0.25) : 6,
      long:  distSorted.length ? percentile(distSorted, 0.80) : 16,
    },
  };
}

// Returns zone name + color for a given average HR
function hrZone(hr, t) {
  if (!hr) return { name: null, color: "#9CA3AF" };
  if (hr < t.hr.easy)      return { name: "easy",      color: "#60A5FA" }; // blue
  if (hr < t.hr.aerobic)   return { name: "aerobic",   color: "#34D399" }; // green
  if (hr < t.hr.tempo)     return { name: "tempo",     color: "#FBBF24" }; // yellow
  if (hr < t.hr.threshold) return { name: "threshold", color: "#F97316" }; // orange
  return                          { name: "hard",       color: "#EF4444" }; // red
}

// Returns badge label or null
function runBadge(km, hr, t) {
  const zone = hrZone(hr, t);
  if (km >= t.dist.long)                       return "LONG";
  if (zone.name === "hard" || zone.name === "threshold") return "HARD";
  if (km <= t.dist.short && (zone.name === "easy" || zone.name === "aerobic")) return "EASY";
  return null;
}

export function renderWeekDetail(weekIdx) {
  APP_STATE.selectedWeekIdx = weekIdx;

  const { weekly, phases, activities } = APP_STATE;
  const w = weekly[weekIdx];
  if (!w) return;

  // Parse week bounds as plain strings — avoids all timezone issues
  const parts        = w.week.includes("/") ? w.week.split("/") : [w.week, w.week];
  const weekStartStr = parts[0]; // "2025-09-22"
  const weekEndStr   = parts[1]; // "2025-09-28"

  console.log(`[weekDetail] week=${w.week}, activities loaded=${(activities||[]).length}`);

  // Filter by comparing date strings directly (no Date objects, no timezone shift)
  const weekActs = (activities || [])
    .filter(a => {
      if (a.type !== "Run") return false;
      const ds = a.start_date.slice(0, 10); // "2025-09-23"
      return ds >= weekStartStr && ds <= weekEndStr;
    })
    .sort((a, b) => a.start_date.localeCompare(b.start_date));

  console.log(`[weekDetail] ${weekStartStr}–${weekEndStr}: found ${weekActs.length} runs`);

  const phase  = phases.find(p => p.id === w.phase_id);
  const pColor = phase ? phaseColor(phase.name) : "#6B7280";

  // Build 7-day array using LOCAL date arithmetic (no toISOString → no UTC shift)
  const [sy, sm, sd] = weekStartStr.split("-").map(Number);
  const days = Array.from({ length: 7 }, (_, i) => {
    const d  = new Date(sy, sm - 1, sd + i);       // local date
    const ds = localDateStr(d);                      // "YYYY-MM-DD" in local time
    const acts = weekActs.filter(a => a.start_date.slice(0, 10) === ds);
    return { date: d, dateStr: ds, acts };
  });

  const totalKm    = weekActs.reduce((s, a) => s + a.distance / 1000, 0);
  const thresholds = buildThresholds(activities);
  const phaseAvgPace = phase?.stats?.avg_pace ?? null;

  // Header label from parsed strings (no timezone dependency)
  const fmtStr = s => {
    const [y, mo, dy] = s.split("-").map(Number);
    return new Date(y, mo - 1, dy).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };
  const headerLabel = `${fmtStr(weekStartStr)} – ${fmtStr(weekEndStr)}, ${sy}`;

  const section = document.getElementById("week-detail-section");
  const content = document.getElementById("week-detail-content");

  const zoomStart = APP_STATE.zoomRange?.weekStart ?? 0;
  const zoomEnd   = APP_STATE.zoomRange?.weekEnd   ?? (weekly.length - 1);
  const hasPrev   = weekIdx > zoomStart;
  const hasNext   = weekIdx < zoomEnd;

  content.innerHTML = `
    <div class="wd-header">
      <div class="wd-header-top">
        <span class="wd-label">${headerLabel}</span>
        <span class="wd-summary">${weekActs.length} run${weekActs.length !== 1 ? "s" : ""} · ${totalKm.toFixed(1)} km</span>
      </div>
      <div class="wd-nav">
        <button class="wd-nav-btn" id="wd-prev-btn" ${hasPrev ? "" : "disabled"} title="Previous week">←</button>
        <button class="wd-nav-btn" id="wd-next-btn" ${hasNext ? "" : "disabled"} title="Next week">→</button>
        <button class="wd-close" id="wd-close-btn" title="Close">×</button>
      </div>
    </div>
    <div class="wd-grid">
      ${days.map((day, di) => renderDayCol(day, di, thresholds, phaseAvgPace)).join("")}
    </div>
  `;

  function closeWeekDetail() {
    clearTimeout(scrollCloseTimer);
    section.style.display = "none";
    APP_STATE.selectedWeekIdx = null;
    window.removeEventListener("wheel", onScrollUp);
    document.dispatchEvent(new CustomEvent("week-deselected"));
  }

  let scrollCloseTimer = null;
  function onScrollUp(e) {
    if (e.deltaY < 0 && !scrollCloseTimer) {
      scrollCloseTimer = setTimeout(() => closeWeekDetail(), 5000);
    }
  }

  document.getElementById("wd-close-btn").addEventListener("click", closeWeekDetail);
  window.addEventListener("wheel", onScrollUp, { passive: true });

  if (hasPrev) {
    document.getElementById("wd-prev-btn").addEventListener("click", () => {
      clearTimeout(scrollCloseTimer);
      window.removeEventListener("wheel", onScrollUp);
      renderWeekDetail(weekIdx - 1);
      document.dispatchEvent(new CustomEvent("week-selected", { detail: { weekIdx: weekIdx - 1 } }));
    });
  }
  if (hasNext) {
    document.getElementById("wd-next-btn").addEventListener("click", () => {
      clearTimeout(scrollCloseTimer);
      window.removeEventListener("wheel", onScrollUp);
      renderWeekDetail(weekIdx + 1);
      document.dispatchEvent(new CustomEvent("week-selected", { detail: { weekIdx: weekIdx + 1 } }));
    });
  }

  section.style.display = "block";
  setTimeout(() => document.getElementById("week-detail-content").scrollIntoView({ behavior: "smooth", block: "center" }), 80);
}

function renderDayCol(day, dayIndex, t, phaseAvgPace) {
  const isWeekend = dayIndex >= 5;
  const isRest    = day.acts.length === 0;
  const dayName   = DAYS[dayIndex];
  const dateNum   = day.date.getDate();

  if (isRest) {
    return `
      <div class="wd-day wd-day--rest${isWeekend ? " wd-day--weekend" : ""}">
        <div class="wd-day-head">
          <span class="wd-weekday">${dayName}</span>
          <span class="wd-datenum">${dateNum}</span>
        </div>
        <div class="wd-rest-label">rest</div>
      </div>`;
  }

  const primary  = day.acts[0];
  const zone     = hrZone(primary.average_heartrate, t);
  const multiRun = day.acts.length > 1;
  const statsHtml = day.acts.map(a => buildRunStats(a, t, phaseAvgPace, multiRun)).join("");

  return `
    <div class="wd-day wd-day--run${isWeekend ? " wd-day--weekend" : ""}"
         data-tooltip="${buildTooltipText(day.acts)}"
         style="--zone-col:${zone.color}">
      ${!multiRun ? `<div class="wd-zone-accent" style="background:${zone.color}">
        ${zone.name ? `<span class="wd-zone-label">${zone.name}</span>` : ""}
      </div>` : ""}
      <div class="wd-day-head">
        <span class="wd-weekday">${dayName}</span>
        <span class="wd-datenum">${dateNum}</span>
      </div>
      <div class="wd-run-stats">${statsHtml}</div>
    </div>`;
}

function buildRunStats(a, t, phaseAvgPace, multiRun = false) {
  const kmVal    = a.distance / 1000;
  const km       = kmVal.toFixed(1);
  const runPace  = a.average_speed > 0 ? 1000 / a.average_speed / 60 : null;
  const pace     = runPace ? formatPace(runPace) : "—";
  const time     = fmtTime(a.moving_time);
  const runName  = `<div class="wd-run-name">${a.name ?? "none"}</div>`;
  const hr       = a.average_heartrate ? `<span class="wd-hr">♥ ${Math.round(a.average_heartrate)}</span>` : "";
  const elev     = a.total_elevation_gain > 5 ? `<span class="wd-elev">↑ ${Math.round(a.total_elevation_gain)} m</span>` : "";

  const zone  = hrZone(a.average_heartrate, t);
  const badge = runBadge(kmVal, a.average_heartrate, t);

  let paceArrow = "";
  if (runPace && phaseAvgPace) {
    const diff = (runPace - phaseAvgPace) / phaseAvgPace;
    if (diff < -0.03)      paceArrow = `<span class="wd-pace-arrow wd-pace-faster">↑</span>`;
    else if (diff > 0.03)  paceArrow = `<span class="wd-pace-arrow wd-pace-slower">↓</span>`;
  }

  const zoneBar = multiRun
    ? `<div class="wd-zone-accent wd-zone-accent--inline" style="background:${zone.color}">
        ${zone.name ? `<span class="wd-zone-label">${zone.name}</span>` : ""}
       </div>`
    : (badge ? `<span class="wd-badge" style="background:${zone.color}">${badge}</span>`
             : `<span class="wd-badge-placeholder"></span>`);

  return `
    <div class="wd-run-block">
      ${zoneBar}
      ${runName}
      <div class="wd-distance">${km} km</div>
      <div class="wd-pace">${pace}${paceArrow}</div>
      <div class="wd-meta">${time}${hr}${elev}</div>
    </div>`;
}

function buildTooltipText(acts) {
  return acts.map(a => {
    const km   = (a.distance / 1000).toFixed(2);
    const pace = formatPace(1000 / a.average_speed / 60);
    const time = fmtTime(a.moving_time);
    const start = a.start_date.slice(11, 16);
    const hr   = a.average_heartrate ? ` · ♥ ${Math.round(a.average_heartrate)} bpm` : "";
    const elev = a.total_elevation_gain > 5 ? ` · ↑ ${Math.round(a.total_elevation_gain)} m` : "";
    return `${km} km · ${pace} · ${time} · ${start}${hr}${elev}`;
  }).join(" | ");
}

function fmtTime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

// Build "YYYY-MM-DD" from a local Date object without UTC conversion
function localDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
