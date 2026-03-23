import APP_STATE from "../js/state.js";

import { formatPace, showTooltip, moveTooltip, hideTooltip } from "../js/utils.js";

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
  if (!hr) return { name: "no HR", color: "#9CA3AF" };
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
      <div class="wd-header-left">
        <span class="wd-label">${headerLabel}</span>
        <div class="section-label wd-section-label">Week Detail <span class="info-hint" data-tooltip="A breakdown of every day in the selected week. Click any run to see its splits and HR chart. Use ← → to navigate between weeks.">?</span></div>
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
    <div class="wd-legend">
      <div class="wd-legend-group">
        <span class="wd-legend-title">HR zone</span>
        <div class="wd-legend-items">
          <span class="wd-legend-item" data-wd-tip="No HR|#9CA3AF|No heart rate recorded for this run."><span class="wd-legend-dot" style="background:#9CA3AF"></span>No HR</span>
          <span class="wd-legend-item" data-wd-tip="Easy|#60A5FA|HR below 25th percentile. Comfortable, recovery-level effort."><span class="wd-legend-dot" style="background:#60A5FA"></span>Easy</span>
          <span class="wd-legend-item" data-wd-tip="Aerobic|#34D399|HR at 25–50th percentile. Steady aerobic base effort."><span class="wd-legend-dot" style="background:#34D399"></span>Aerobic</span>
          <span class="wd-legend-item" data-wd-tip="Tempo|#FBBF24|HR at 50–75th percentile. Comfortably hard, lactate threshold zone."><span class="wd-legend-dot" style="background:#FBBF24"></span>Tempo</span>
          <span class="wd-legend-item" data-wd-tip="Threshold|#F97316|HR at 75–90th percentile. Hard effort near lactate threshold."><span class="wd-legend-dot" style="background:#F97316"></span>Threshold</span>
          <span class="wd-legend-item" data-wd-tip="Hard|#EF4444|HR above 90th percentile. Maximum intensity effort."><span class="wd-legend-dot" style="background:#EF4444"></span>Hard</span>
        </div>
      </div>
      <div class="wd-legend-group wd-legend-group--right">
        <span class="wd-legend-title">Run type</span>
        <div class="wd-legend-items">
          <span class="wd-legend-item" data-wd-tip="EASY|#60A5FA|Short, low-intensity run — distance below 25th percentile, easy or aerobic zone."><span class="wd-legend-badge" style="background:#60A5FA">EASY</span></span>
          <span class="wd-legend-item" data-wd-tip="LONG|#34D399|Long run — distance at or above 80th percentile of all your runs."><span class="wd-legend-badge" style="background:#34D399">LONG</span></span>
          <span class="wd-legend-item" data-wd-tip="HARD|#EF4444|High-intensity run — threshold or max HR zone effort."><span class="wd-legend-badge" style="background:#EF4444">HARD</span></span>
        </div>
      </div>
    </div>
    <div id="wd-run-detail-panel" class="wd-run-detail-panel" style="display:none"></div>
  `;

  // ── Legend tooltips ──
  const wdTooltip = d3.select("body").select(".wd-legend-tooltip").empty()
    ? d3.select("body").append("div").attr("class", "tooltip wd-legend-tooltip")
    : d3.select("body").select(".wd-legend-tooltip");
  wdTooltip.style("display", "none");

  content.querySelectorAll("[data-wd-tip]").forEach(el => {
    el.addEventListener("mouseenter", (event) => {
      const [title, color, text] = el.dataset.wdTip.split("|");
      showTooltip(wdTooltip, event,
        `<div style="font-weight:700;font-size:14px;color:${color};margin-bottom:6px">${title}</div>
         <div style="color:#6B7280;font-size:12px;line-height:1.6;max-width:220px">${text}</div>`);
    });
    el.addEventListener("mousemove", (event) => moveTooltip(wdTooltip, event));
    el.addEventListener("mouseleave", () => hideTooltip(wdTooltip));
  });

  function closeWeekDetail() {
    section.style.display = "none";
    APP_STATE.selectedWeekIdx = null;
    document.dispatchEvent(new CustomEvent("week-deselected"));
    setTimeout(() => {
      document.getElementById("zoom-timeline-chart")
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 50);
  }

  document.getElementById("wd-close-btn").addEventListener("click", closeWeekDetail);

  if (hasPrev) {
    document.getElementById("wd-prev-btn").addEventListener("click", () => {
      renderWeekDetail(weekIdx - 1);
      document.dispatchEvent(new CustomEvent("week-selected", { detail: { weekIdx: weekIdx - 1 } }));
    });
  }
  if (hasNext) {
    document.getElementById("wd-next-btn").addEventListener("click", () => {
      renderWeekDetail(weekIdx + 1);
      document.dispatchEvent(new CustomEvent("week-selected", { detail: { weekIdx: weekIdx + 1 } }));
    });
  }

  section.style.display = "block";
  setTimeout(() => document.getElementById("week-detail-content").scrollIntoView({ behavior: "smooth", block: "center" }), 80);

  // Click on run card → open detail panel below grid
  let activeRunId = null;
  content.querySelectorAll(".wd-run-block[data-activity-id]").forEach(block => {
    block.style.cursor = "pointer";
    block.addEventListener("click", async () => {
      const id = block.dataset.activityId;
      const panel = document.getElementById("wd-run-detail-panel");

      // Toggle off if same run clicked again
      if (activeRunId === id) {
        panel.style.display = "none";
        activeRunId = null;
        content.querySelectorAll(".wd-run-block").forEach(b => b.classList.remove("wd-run-block--active"));
        return;
      }

      activeRunId = id;
      content.querySelectorAll(".wd-run-block").forEach(b => b.classList.remove("wd-run-block--active"));
      block.classList.add("wd-run-block--active");

      panel.style.display = "block";
      panel.innerHTML = `<div class="wd-run-detail-loading">Loading chart…</div>`;

      try {
        const res = await fetch(`/api/activities/${id}/laps`);
        const data = await res.json();
        if (data.error) throw new Error(data.error);

        const runName = block.querySelector(".wd-run-name")?.textContent ?? "";
        const runDist = block.querySelector(".wd-distance")?.textContent ?? "";
        const act = weekActs.find(a => String(a.id) === String(id));
        let dateLabel = "";
        if (act?.start_date) {
          const [y, mo, dy] = act.start_date.slice(0, 10).split("-").map(Number);
          dateLabel = new Date(y, mo - 1, dy).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
        }

        panel.innerHTML = `
          <div class="wd-run-detail-header">
            <div class="wd-run-detail-title">${dateLabel ? `${dateLabel} — ` : ""}${runName || runDist}</div>
            <div class="wd-run-detail-meta">${runDist}</div>
          </div>
          <div id="wd-splits-chart"></div>
        `;
        renderSplitsChart(document.getElementById("wd-splits-chart"), data);

        setTimeout(() => panel.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
      } catch(e) {
        panel.innerHTML = `<div class="wd-streams-error">Could not load chart: ${e.message}</div>`;
      }
    });
  });
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
      ${!multiRun
        ? `<div class="wd-zone-accent" style="background:${zone.color}">${zone.name ? `<span class="wd-zone-label">${zone.name}</span>` : ""}</div>`
        : `<div class="wd-zone-accent" style="background:#E5E7EB"></div>`
      }
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

  const actId = typeof a.id === "number" ? a.id : null;
  return `
    <div class="wd-run-block"${actId ? ` data-activity-id="${actId}"` : ""}>
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

function renderSplitsChart(el, laps) {
  if (!laps || !laps.length) {
    el.innerHTML = `<div class="wd-streams-error">No splits data available</div>`;
    return;
  }

  const fmtPace = p => {
    if (!p) return "—";
    const min = Math.floor(p);
    const sec = Math.round((p - min) * 60);
    return `${min}:${String(sec).padStart(2, "0")}`;
  };

  const fullLaps  = laps.filter(l => l.pace != null);
  const avgPace   = d3.mean(fullLaps, l => l.pace);
  const fastestKm = d3.min(fullLaps, l => l.pace);
  const slowestKm = d3.max(fullLaps, l => l.pace);
  const hasHR     = laps.some(l => l.hr != null);
  const hasElev   = laps.some(l => l.elev != null && Math.abs(l.elev) > 0);

  // Trend: compare first half vs second half avg pace
  const half = Math.floor(fullLaps.length / 2);
  const firstHalf  = d3.mean(fullLaps.slice(0, half), l => l.pace);
  const secondHalf = d3.mean(fullLaps.slice(half), l => l.pace);
  const trendDiff  = firstHalf - secondHalf; // positive = got faster (negative split)
  const splitHint = trendDiff > 0
    ? "2nd half faster — good pacing"
    : "1st half faster — pace dropped";
  const trendHintIcon = Math.abs(trendDiff) < 0.1 ? ""
    : `<span class="wd-trend-hint" data-tip="${splitHint}">?</span>`;
  const trendLabel = Math.abs(trendDiff) < 0.1 ? "Even pace"
    : trendDiff > 0 ? `↑ Negative split <span style="color:#22C55E;font-weight:700">+${Math.round(trendDiff * 60)}s</span>${trendHintIcon}`
    : `↓ Positive split <span style="color:#EF4444;font-weight:700">${Math.round(trendDiff * 60)}s</span>${trendHintIcon}`;

  // Max deviation for bar scale
  const maxDev = Math.max(...fullLaps.map(l => Math.abs(l.pace - avgPace))) || 0.5;

  const rows = laps.map(l => {
    const p   = l.pace;
    const dev = p != null ? p - avgPace : 0;
    const pct = Math.min(Math.abs(dev) / maxDev * 45, 45);

    // faster = green bar left of center, slower = red bar right of center
    const isFaster = dev < -0.08;
    const isSlower = dev >  0.08;
    const barColor  = isFaster ? "#22C55E" : isSlower ? "#EF4444" : "#94A3B8";
    const barSide   = isFaster ? "right" : "left"; // green extends left (toward center from left)

    const kmLabel = l.distance < 950
      ? `${(l.distance / 1000).toFixed(1)}`
      : String(l.index);

    const elevHtml = hasElev
      ? `<td class="wd-split-elev">${l.elev != null
          ? `<span style="color:${l.elev > 2 ? "#F97316" : l.elev < -2 ? "#6366F1" : "#9CA3AF"}">${l.elev > 0 ? "↑" : l.elev < 0 ? "↓" : "—"}${Math.abs(Math.round(l.elev))}m</span>`
          : "—"}</td>` : "";

    const hrHtml = hasHR
      ? `<td class="wd-split-hr">${l.hr != null ? Math.round(l.hr) : "—"}</td>` : "";

    return `<tr class="wd-split-row">
      <td class="wd-split-km">${kmLabel}</td>
      <td class="wd-split-pace" style="color:${isFaster ? "#15803D" : isSlower ? "#DC2626" : "#111827"}">${fmtPace(p)}</td>
      <td class="wd-split-bar-cell">
        <div class="wd-split-bar-wrap">
          <div class="wd-split-bar-center"></div>
          <div class="wd-split-bar wd-split-bar--${barSide}" style="width:${pct}%;background:${barColor}"></div>
        </div>
      </td>
      ${elevHtml}${hrHtml}
    </tr>`;
  }).join("");

  // ── HR per km — line through zone bands ──
  let hrDeviationHtml = "";
  if (hasHR) {
    const HR_ZONES = [
      { name: "Easy",      min: 0,   max: 140, color: "#3B82F6", bg: "rgba(219,234,254,0.55)" },
      { name: "Aerobic",   min: 140, max: 155, color: "#10B981", bg: "rgba(209,250,229,0.55)" },
      { name: "Tempo",     min: 155, max: 165, color: "#F59E0B", bg: "rgba(254,243,199,0.55)" },
      { name: "Threshold", min: 165, max: 175, color: "#F97316", bg: "rgba(255,237,213,0.55)" },
      { name: "Hard",      min: 175, max: 999, color: "#EF4444", bg: "rgba(254,226,226,0.55)" },
    ];
    const hrData = fullLaps.filter(l => l.hr != null);
    const avgHR  = d3.mean(hrData, l => l.hr);
    const minHR  = d3.min(hrData, l => l.hr);
    const maxHR  = d3.max(hrData, l => l.hr);

    // cardiac drift slope
    const n     = hrData.length;
    const xMean = (n - 1) / 2;
    const slope = n > 1
      ? hrData.reduce((s, l, i) => s + (i - xMean) * (l.hr - avgHR), 0) /
        hrData.reduce((s, _, i) => s + (i - xMean) ** 2, 0)
      : 0;

    const W = 580; const H = 140; const PL = 34; const PR = 72; const PT = 8; const PB = 22;
    const cW = W - PL - PR; const cH = H - PT - PB;
    const yLo = Math.min(minHR - 6, 132);
    const yHi = Math.max(maxHR + 6, 178);

    const yS = v => PT + cH - (v - yLo) / (yHi - yLo) * cH;
    const xS = i => PL + (i / Math.max(hrData.length - 1, 1)) * cW;

    // zone background bands
    const bands = HR_ZONES.map(z => {
      const top = Math.min(z.max, yHi);
      const bot = Math.max(z.min, yLo);
      if (top <= bot) return "";
      const y1 = yS(top); const y2 = yS(bot); const bH = y2 - y1;
      const labelY = y1 + bH / 2 + 3.5;
      const showLabel = bH > 10;
      return `<rect x="${PL}" y="${y1}" width="${cW}" height="${bH}" fill="${z.bg}"/>` +
             `<line x1="${PL}" y1="${y1}" x2="${PL + cW}" y2="${y1}" stroke="${z.color}" stroke-width="0.6" opacity="0.35"/>` +
             (showLabel ? `<text x="${PL + cW + 5}" y="${labelY}" font-size="9.5" fill="${z.color}" font-weight="400">${z.name}</text>` : "");
    }).join("");

    // colored line segments (each segment colored by start point zone)
    const zoneOf = hr => HR_ZONES.find(z => hr < z.max) ?? HR_ZONES[HR_ZONES.length - 1];
    const segments = hrData.slice(1).map((l, i) => {
      const x1 = xS(i); const y1 = yS(hrData[i].hr);
      const x2 = xS(i + 1); const y2 = yS(l.hr);
      const col = zoneOf(hrData[i].hr).color;
      return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${col}" stroke-width="1.5" stroke-linecap="round"/>`;
    }).join("");

    // dots with hover tooltips
    const dots = hrData.map((l, i) => {
      const cx  = xS(i); const cy = yS(l.hr);
      const col = zoneOf(l.hr).color;

      // place tooltip above or below depending on room
      const tipW = 44; const tipH = 22;
      const tipDx = cx - PL < tipW / 2 ? -(cx - PL) + 2
                  : cx + tipW / 2 > PL + cW ? PL + cW - cx - tipW
                  : -tipW / 2;
      const tipDy = cy - PT > tipH + 6 ? -(tipH + 6) : 10;

      return `<g class="wd-hr-pt" style="cursor:default">
        <circle cx="${cx}" cy="${cy}" r="10" fill="transparent" style="pointer-events:all"/>
        <circle cx="${cx}" cy="${cy}" r="4" fill="${col}" stroke="white" stroke-width="1.5" style="pointer-events:none"/>
        <g class="wd-hr-tip" transform="translate(${cx + tipDx},${cy + tipDy})" style="pointer-events:none">
          <rect width="${tipW}" height="${tipH}" rx="4" fill="white" stroke="#E5E7EB" stroke-width="0.8"/>
          <text x="${tipW/2}" y="14" text-anchor="middle" font-size="8" font-weight="600" fill="${col}">${Math.round(l.hr)} bpm</text>
        </g>
      </g>`;
    }).join("");

    const valLabels = "";

    // km x-axis labels
    const xLabels = hrData.map((l, i) => {
      const kmLabel = l.distance < 950 ? `${(l.distance / 1000).toFixed(1)}` : String(l.index);
      return `<text x="${xS(i)}" y="${H - 5}" text-anchor="middle" font-size="8.5" fill="#9CA3AF">${kmLabel}</text>`;
    }).join("");

    // y-axis bpm ticks
    const yTicks = [yLo, avgHR, yHi].map(v =>
      `<text x="${PL - 3}" y="${yS(v) + 3}" text-anchor="end" font-size="8.5" fill="#9CA3AF">${Math.round(v)}</text>`
    ).join("");

    // insight text
    const startZ = zoneOf(hrData[0].hr);
    const endZ   = zoneOf(hrData[hrData.length - 1].hr);
    const zOrder = HR_ZONES.map(z => z.name);
    let insight = "";
    if (startZ.name === endZ.name) {
      insight = `<span style="color:${startZ.color};font-weight:600">Ran entirely in ${startZ.name} zone</span> — ${
        startZ.name === "Easy" ? "comfortable recovery run, great for base building."
        : startZ.name === "Aerobic" ? "solid aerobic session, ideal for endurance."
        : startZ.name === "Tempo" ? "quality tempo effort, builds lactate threshold."
        : "high-intensity — plan extra recovery tomorrow."
      }`;
    } else if (zOrder.indexOf(endZ.name) > zOrder.indexOf(startZ.name)) {
      const driftNote = slope > 1.5
        ? ` ⚠️ <b>Cardiac drift</b>: HR climbed +${slope.toFixed(1)} bpm/km — likely fatigue or heat.`
        : ` Typical warm-up pattern.`;
      insight = `Started in <span style="color:${startZ.color};font-weight:600">${startZ.name}</span>, finished in <span style="color:${endZ.color};font-weight:600">${endZ.name}</span>.${driftNote}`;
    } else {
      insight = `HR eased from <span style="color:${startZ.color};font-weight:600">${startZ.name}</span> to <span style="color:${endZ.color};font-weight:600">${endZ.name}</span> — controlled finish, good pacing.`;
    }

    hrDeviationHtml = `
      <div class="wd-section-block">
        <div style="display:flex;align-items:center;justify-content:space-between;padding-left:5.9%;padding-right:12.4%;margin-bottom:10px">
          <div class="wd-hr-heading">
            <span class="wd-hr-heading-title">Heart rate per km</span>
            <span class="wd-trend-hint" data-tip="HR in each km.&#10;Colored bands = training zones.&#10;Rising HR over time = cardiac drift (fatigue).">?</span>
          </div>
          <div class="wd-splits-summary" style="margin:0">
            <div class="wd-splits-stat"><span>avg</span><b>${Math.round(avgHR)} bpm</b></div>
            <div class="wd-splits-stat"><span>min</span><b style="color:#15803D">${Math.round(minHR)} bpm</b></div>
            <div class="wd-splits-stat"><span>max</span><b style="color:#DC2626">${Math.round(maxHR)} bpm</b></div>
          </div>
        </div>
        <svg viewBox="0 0 ${W} ${H}" width="100%" style="display:block;margin-bottom:8px;overflow:visible">
          ${bands}
          ${segments}
          ${dots}
          ${valLabels}
          ${yTicks}
          ${xLabels}
        </svg>
        <div class="wd-section-hint">${insight}</div>
      </div>`;
  }

  // ── Training zones breakdown ──
  const ZONES = [
    { name: "Easy",      max: 140, color: "#60A5FA", hrRange: "< 140 bpm", desc: "Very light. Recovery run, warm-up." },
    { name: "Aerobic",   max: 155, color: "#34D399", hrRange: "140–155 bpm", desc: "Base fitness. Sustainable long run." },
    { name: "Tempo",     max: 165, color: "#FBBF24", hrRange: "155–165 bpm", desc: "Comfortably hard. Builds threshold." },
    { name: "Threshold", max: 175, color: "#F97316", hrRange: "165–175 bpm", desc: "Race-pace effort. Hard to sustain." },
    { name: "Hard",      max: 999, color: "#EF4444", hrRange: "> 175 bpm",  desc: "Maximum effort. Short bursts only." },
  ];
  let effortHtml = "";
  if (hasHR) {
    const zoneKm = ZONES.map(z => ({ ...z, km: 0 }));
    fullLaps.filter(l => l.hr != null).forEach(l => {
      const zone = zoneKm.find(z => l.hr < z.max);
      if (zone) zone.km += l.distance / 1000;
    });
    const totalKmWithHR = d3.sum(zoneKm, z => z.km) || 1;
    const dominantZone  = zoneKm.reduce((a, b) => b.km > a.km ? b : a);
    const activeZones   = zoneKm.filter(z => z.km > 0);

    // stacked overview bar
    const stackedSegments = activeZones.map(z => {
      const pct = (z.km / totalKmWithHR * 100).toFixed(1);
      return `<div title="${z.name}: ${z.km.toFixed(1)} km (${pct}%)"
        style="flex:${z.km};background:${z.color};height:100%;display:flex;align-items:center;justify-content:center;min-width:4px">
        ${parseFloat(pct) >= 10 ? `<span style="font-size:11px;font-weight:700;color:white;text-shadow:0 1px 3px rgba(0,0,0,0.4)">${pct}%</span>` : ""}
      </div>`;
    }).join("");

    // zone rows — name | hr range | bar | % | km
    const zoneRows = activeZones.map(z => {
      const pct = z.km / totalKmWithHR * 100;
      const extraMargin = (z.name === "Threshold" || z.name === "Hard") ? ' style="margin-top:14px"' : '';
      return `<div class="wd-zone-row"${extraMargin}>
        <div class="wd-zone-row-name">
          <span class="wd-effort-dot wd-zone-dot-tip" style="background:${z.color}" data-tip="${z.desc}"></span>
          <span style="font-size:13px;font-weight:700;color:#111827">${z.name}</span>
        </div>
        <span class="wd-zone-row-range">${z.hrRange}</span>
        <div class="wd-zone-row-bar-wrap">
          <div class="wd-zone-row-bar" style="width:${pct}%;background:${z.color}"></div>
        </div>
        <span class="wd-zone-row-pct">${pct.toFixed(0)}%</span>
        <span class="wd-zone-row-km">${z.km.toFixed(1)} km</span>
      </div>`;
    }).join("");

    const recoveryNote = dominantZone.name === "Easy" || dominantZone.name === "Aerobic"
      ? "Good aerobic base work. Low stress on the body."
      : dominantZone.name === "Tempo"
        ? "Quality tempo session. Builds lactate threshold."
        : "High-intensity run. Plan extra recovery before next hard effort.";

    effortHtml = `
      <div class="wd-section-block">
        <div class="wd-hr-heading" style="margin-bottom:14px;margin-top:10px">
          <span class="wd-hr-heading-title">Training zones</span>
          <span class="wd-trend-hint" data-tip="How much of the run you spent&#10;in each HR intensity zone.&#10;Based on heart rate per km.">?</span>
        </div>
        <div class="wd-zones-summary-bar">${stackedSegments}</div>
        <div class="wd-zones-dominant">
          This run was mostly in
          <b style="color:${dominantZone.color}">${dominantZone.name}</b> zone
          — ${recoveryNote}
        </div>
        <div class="wd-zone-rows">${zoneRows}</div>
        <div style="height:100px"></div>
      </div>`;
  }

  // ── Efficiency index per km ──
  let efficiencyHtml = "";
  if (hasHR) {
    const effData = fullLaps.filter(l => l.pace != null && l.hr != null)
      .map(l => ({ index: l.index, distance: l.distance, eff: (1 / l.pace) / l.hr * 10000 }));
    const avgEff  = d3.mean(effData, d => d.eff);
    const maxEffDev = Math.max(...effData.map(d => Math.abs(d.eff - avgEff))) || 0.1;
    const effRows = laps.map(l => {
      const match = effData.find(d => d.index === l.index);
      if (!match) return "";
      const dev  = match.eff - avgEff;
      const pct  = Math.min(Math.abs(dev) / maxEffDev * 45, 45);
      const isGood = dev >  0.005;
      const isBad  = dev < -0.005;
      const color  = isGood ? "#22C55E" : isBad ? "#EF4444" : "#94A3B8";
      const side   = isGood ? "right" : "left";
      const kmLabel = l.distance < 950 ? `${(l.distance/1000).toFixed(1)}` : String(l.index);
      return `<tr class="wd-split-row">
        <td class="wd-split-km">${kmLabel}</td>
        <td class="wd-split-pace" style="color:${isGood?"#15803D":isBad?"#DC2626":"#111827"};font-size:12px">${match.eff.toFixed(2)}</td>
        <td class="wd-split-bar-cell">
          <div class="wd-split-bar-wrap">
            <div class="wd-split-bar-center"></div>
            <div class="wd-split-bar wd-split-bar--${side}" style="width:${pct}%;background:${color}"></div>
          </div>
        </td>
      </tr>`;
    }).filter(Boolean).join("");
    efficiencyHtml = `
      <div class="wd-section-block">
        <div class="wd-hr-heading" style="margin-bottom:10px;margin-top:0">
          <span class="wd-hr-heading-title">Efficiency per km</span>
          <span class="wd-trend-hint" data-tip="Speed divided by heart rate.&#10;Higher = faster with less effort.&#10;Green = more efficient than your avg.&#10;Red = working harder than usual.">?</span>
        </div>
        <table class="wd-splits-table">
          <thead><tr>
            <th>Km</th>
            <th>Index</th>
            <th style="text-align:center;font-size:12px;font-weight:600;color:#6B7280">less efficient ← avg → more efficient</th>
          </tr></thead>
          <tbody>${effRows}</tbody>
        </table>
      </div>`;
  }

  // ── Assemble tab content panels ──
  const pacePanelHtml = `
    <div class="wd-hr-heading" style="margin-bottom:10px">
      <span class="wd-hr-heading-title">Pace per km</span>
      <span class="wd-trend-hint" data-tip="Pace for each km.&#10;Green = faster than avg.&#10;Red = slower than avg.">?</span>
    </div>
    <table class="wd-splits-table">
      <thead><tr>
        <th>Km</th><th>Pace</th>
        <th style="text-align:center">
          <div style="font-size:13px;font-weight:700;color:#111827;margin-bottom:2px"><span style="color:#9CA3AF;font-weight:400">slower</span> ← avg → <span style="color:#9CA3AF;font-weight:400">faster</span></div>
        </th>
        ${hasElev ? "<th>Elev</th>" : ""}${hasHR ? "<th>HR</th>" : ""}
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="wd-splits-top" style="margin-top:14px">
      <div class="wd-splits-summary">
        <div class="wd-splits-stat"><span>avg</span><b>${fmtPace(avgPace)}</b></div>
        <div class="wd-splits-stat"><span>best</span><b style="color:#15803D">${fmtPace(fastestKm)}</b></div>
        <div class="wd-splits-stat"><span>slowest</span><b style="color:#DC2626">${fmtPace(slowestKm)}</b></div>
      </div>
      <div class="wd-splits-trend">${trendLabel}</div>
    </div>`;

  const hrPanelHtml  = hasHR ? hrDeviationHtml
    : `<p class="wd-streams-error">No heart rate data for this run.</p>`;

  const zonesPanelHtml = hasHR ? effortHtml
    : `<p class="wd-streams-error">No heart rate data for this run.</p>`;

  const effPanelHtml = hasHR ? efficiencyHtml
    : `<p class="wd-streams-error">No heart rate data for this run.</p>`;

  const tabs = [
    { id: "pace",       icon: "↕",  label: "Pace",       sub: "km splits"    },
    { id: "hr",         icon: "♥",  label: "Heart Rate", sub: "zone chart"   },
    { id: "zones",      icon: "◎",  label: "Zones",      sub: "time in zone" },
    { id: "efficiency", icon: "⚡", label: "Efficiency", sub: "effort ratio"  },
  ];

  el.innerHTML = `
    <nav class="wd-tabs-nav">
      ${tabs.map((t, i) => `
        <button class="wd-tab-btn${i === 0 ? " wd-tab-btn--active" : ""}" data-tab="${t.id}">
          <span class="wd-tab-icon">${t.icon}</span>
          <span class="wd-tab-label">${t.label}</span>
          <span class="wd-tab-sub">${t.sub}</span>
        </button>`).join("")}
    </nav>
    <div class="wd-tab-panels">
      <div class="wd-tab-panel" data-panel="pace">${pacePanelHtml}</div>
      <div class="wd-tab-panel" data-panel="hr" style="display:none">${hrPanelHtml}</div>
      <div class="wd-tab-panel" data-panel="zones" style="display:none">${zonesPanelHtml}</div>
      <div class="wd-tab-panel" data-panel="efficiency" style="display:none">${effPanelHtml}</div>
    </div>
  `;

  el.querySelectorAll(".wd-tab-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      el.querySelectorAll(".wd-tab-btn").forEach(b => b.classList.remove("wd-tab-btn--active"));
      el.querySelectorAll(".wd-tab-panel").forEach(p => p.style.display = "none");
      btn.classList.add("wd-tab-btn--active");
      el.querySelector(`[data-panel="${btn.dataset.tab}"]`).style.display = "block";
    });
  });
}
