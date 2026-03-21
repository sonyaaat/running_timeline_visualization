import APP_STATE from "../js/state.js";
import { phaseColor, phaseTextColor } from "../js/colors.js";
import { formatPace } from "../js/utils.js";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

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

  const totalKm  = weekActs.reduce((s, a) => s + a.distance / 1000, 0);
  const maxDayKm = Math.max(...days.map(d => d.acts.reduce((s, a) => s + a.distance / 1000, 0)), 0.1);

  // Header label from parsed strings (no timezone dependency)
  const fmtStr = s => {
    const [y, mo, dy] = s.split("-").map(Number);
    return new Date(y, mo - 1, dy).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };
  const headerLabel = `${fmtStr(weekStartStr)} – ${fmtStr(weekEndStr)}, ${sy}`;
  const [mY, mMo] = weekStartStr.split("-").map(Number);
  const monthLabel = new Date(mY, mMo - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });

  const section = document.getElementById("week-detail-section");
  const content = document.getElementById("week-detail-content");

  content.innerHTML = `
    <div class="wd-header">
      <div class="wd-title-row">
        <span class="wd-label">Week of ${headerLabel}</span>
        <span class="wd-summary">${weekActs.length} run${weekActs.length !== 1 ? "s" : ""} · ${totalKm.toFixed(1)} km</span>
      </div>
      <span class="wd-month">${monthLabel}</span>
      <button class="wd-close" id="wd-close-btn">×</button>
    </div>
    <div class="wd-grid">
      ${days.map((day, di) => renderDayCol(day, di, maxDayKm, pColor)).join("")}
    </div>
  `;

  document.getElementById("wd-close-btn").addEventListener("click", () => {
    section.style.display = "none";
    APP_STATE.selectedWeekIdx = null;
    // Re-render timeline to remove highlight — dispatch custom event
    document.dispatchEvent(new CustomEvent("week-deselected"));
  });

  section.style.display = "block";
  setTimeout(() => document.getElementById("week-detail-content").scrollIntoView({ behavior: "smooth", block: "center" }), 80);
}

function renderDayCol(day, dayIndex, maxDayKm, phaseColor) {
  const isWeekend = dayIndex >= 5; // Sat, Sun
  const dayKm     = day.acts.reduce((s, a) => s + a.distance / 1000, 0);
  const isRest    = day.acts.length === 0;
  const barPct    = isRest ? 0 : Math.max(8, (dayKm / maxDayKm) * 100);

  const dayName = DAYS[dayIndex];
  const dateNum = day.date.getDate();

  if (isRest) {
    return `
      <div class="wd-day wd-day--rest${isWeekend ? " wd-day--weekend" : ""}">
        <div class="wd-day-head">
          <span class="wd-weekday">${dayName}</span>
          <span class="wd-datenum">${dateNum}</span>
        </div>
        <div class="wd-bar-area"></div>
        <div class="wd-rest-label">rest</div>
      </div>`;
  }

  // For multiple runs in one day (rare but possible), show the primary one inline + list all
  const primary = day.acts[0];
  const statsHtml = day.acts.map(a => buildRunStats(a)).join('<div class="wd-run-divider"></div>');

  return `
    <div class="wd-day wd-day--run${isWeekend ? " wd-day--weekend" : ""}"
         data-tooltip="${buildTooltipText(day.acts)}"
         style="--phase-col:${phaseColor}">
      <div class="wd-day-head">
        <span class="wd-weekday">${dayName}</span>
        <span class="wd-datenum">${dateNum}</span>
      </div>
      <div class="wd-bar-area">
        <div class="wd-bar" style="height:${barPct}%;background:${phaseColor}"></div>
      </div>
      <div class="wd-run-stats">${statsHtml}</div>
      <div class="wd-tooltip-box"></div>
    </div>`;
}

function buildRunStats(a) {
  const km    = (a.distance / 1000).toFixed(1);
  const pace  = formatPace(1000 / a.average_speed / 60);
  const time  = fmtTime(a.moving_time);
  const start = a.start_date.slice(11, 16); // "HH:MM"
  const hr    = a.average_heartrate ? `<span class="wd-hr">♥ ${Math.round(a.average_heartrate)}</span>` : "";
  const elev  = a.total_elevation_gain > 5 ? `<span class="wd-elev">↑ ${Math.round(a.total_elevation_gain)} m</span>` : "";

  return `
    <div class="wd-distance">${km} km</div>
    <div class="wd-pace">${pace}</div>
    <div class="wd-meta">${time} · ${start}${hr}${elev}</div>`;
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
