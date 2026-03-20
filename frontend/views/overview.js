import APP_STATE from "../js/state.js";
import { phaseColor, phaseTextColor } from "../js/colors.js";
import { formatWeekLabel, showTooltip, hideTooltip } from "../js/utils.js";
import { renderDetail as renderZoomDetail } from "./zoomTimeline.js";

const STRIP_H  = 48;
const CHART_H  = 180;
const MONTH_H  = 24;
const LEGEND_H = 22;
const MARGIN   = { top: 12, right: 0, bottom: 8, left: 0 };

// ─────────────────────────────────────────────────────────
// Public: renderOverview
// ─────────────────────────────────────────────────────────
export function renderOverview() {
  const container = document.getElementById("overview-chart");
  container.innerHTML = "";

  const { phases, weekly, meta } = APP_STATE;
  const nWeeks  = meta.total_weeks ?? weekly.length;
  const W       = container.clientWidth || window.innerWidth;
  const innerW  = W - MARGIN.left - MARGIN.right;
  const totalH  = MARGIN.top + STRIP_H + CHART_H + MONTH_H + LEGEND_H + MARGIN.bottom;

  console.log("[overview] Rendering:", phases.length, "phases,", weekly.length, "weeks, width:", W);
  console.log("[overview] Efficiency line:", meta.has_hr);

  const x = d3.scaleLinear().domain([0, nWeeks]).range([0, innerW]);

  const svg = d3.select(container)
    .append("svg")
    .attr("width", W)
    .attr("height", totalH);

  // ── Defs: diagonal stripe pattern for inactive segments ──
  const defs = svg.append("defs");
  const pat = defs.append("pattern")
    .attr("id", "inactive-stripe")
    .attr("patternUnits", "userSpaceOnUse")
    .attr("width", 6).attr("height", 6);
  pat.append("rect")
    .attr("width", 6).attr("height", 6)
    .attr("fill", "#E5E7EB");
  pat.append("path")
    .attr("d", "M-1,1 l2,-2 M0,6 l6,-6 M5,7 l2,-2")
    .attr("stroke", "#D1D5DB")
    .attr("stroke-width", 1);

  const root = svg.append("g")
    .attr("transform", `translate(${MARGIN.left},${MARGIN.top})`);

  const tooltip = getOrCreateTooltip();

  // ─────────────────────────────────────────────────────────
  // ROW 1 — Phase strip
  // ─────────────────────────────────────────────────────────
  const stripG = root.append("g").attr("class", "phase-strip");

  // Grey base background
  stripG.append("rect")
    .attr("width", innerW).attr("height", STRIP_H)
    .attr("fill", "#F3F4F6");

  // Draw Active first, Inactive on top (Inactive covers Active where they overlap)
  const activePhases   = phases.filter(p => p.type === "Active");
  const inactivePhases = phases.filter(p => p.type === "Inactive");

  function drawStripSegments(phaseList) {
    phaseList.forEach(phase => {
      const px1 = x(phase.week_start);
      const px2 = x(phase.week_end + 1);
      const bw  = Math.max(1, px2 - px1);
      const isInactive = phase.type === "Inactive";
      const opacity    = getPhaseOpacity(phase);

      // Fill rect
      stripG.append("rect")
        .attr("x", px1).attr("y", 0)
        .attr("width", bw).attr("height", STRIP_H)
        .attr("fill", isInactive ? "url(#inactive-stripe)" : phaseColor(phase.name))
        .attr("opacity", opacity)
        .attr("class", `strip-seg seg-${phase.id}`)
        .style("cursor", isInactive ? "default" : "pointer")
        .on("mouseover", (event) => {
          const weeks = phase.week_end - phase.week_start + 1;
          const s = phase.stats || {};
          const tc = isInactive ? "#6B7280" : phaseTextColor(phase.name);
          const html = isInactive
            ? `<b style="color:#6B7280">Inactive</b> · ${weeks}w pause`
            : `<b style="color:${tc}">${phase.name}</b> · ${weeks}w · ${s.km_per_week != null ? s.km_per_week.toFixed(1) : "—"} km/w avg`;
          showTooltip(tooltip, event, html);
        })
        .on("mousemove", (event) => {
          tooltip
            .style("left", (event.pageX + 12) + "px")
            .style("top",  (event.pageY - 28) + "px");
        })
        .on("mouseout", () => hideTooltip(tooltip))
        .on("click", () => {
          if (isInactive) return;
          renderDetail(phase.week_start, phase.week_end);
        });

      // Label
      if (bw >= 30) {
        let label;
        if (isInactive) {
          label = "–";
        } else if (bw >= 70) {
          label = phase.name;
        } else {
          label = phase.name.split(/[\s/]/)[0];
        }
        stripG.append("text")
          .attr("x", px1 + bw / 2)
          .attr("y", STRIP_H / 2)
          .attr("text-anchor", "middle")
          .attr("dominant-baseline", "middle")
          .style("font-size", "12px")
          .style("font-weight", "500")
          .style("pointer-events", "none")
          .attr("fill", isInactive ? "#9CA3AF" : phaseTextColor(phase.name))
          .attr("opacity", opacity)
          .text(label);
      }

      // 1px white separator at segment end
      if (bw > 1) {
        stripG.append("line")
          .attr("x1", px2).attr("x2", px2)
          .attr("y1", 0).attr("y2", STRIP_H)
          .attr("stroke", "white")
          .attr("stroke-width", 1)
          .style("pointer-events", "none");
      }
    });
  }

  drawStripSegments(activePhases);
  drawStripSegments(inactivePhases);

  // ─────────────────────────────────────────────────────────
  // ROW 2 — Chart area
  // ─────────────────────────────────────────────────────────
  const chartG = root.append("g")
    .attr("class", "chart-area")
    .attr("transform", `translate(0,${STRIP_H})`);

  // Phase background bands
  activePhases.forEach(phase => {
    chartG.append("rect")
      .attr("x", x(phase.week_start))
      .attr("y", 0)
      .attr("width", Math.max(0, x(phase.week_end + 1) - x(phase.week_start)))
      .attr("height", CHART_H)
      .attr("fill", phaseColor(phase.name))
      .attr("opacity", 0.10);
  });

  // Phase boundary separator lines
  const boundaries = new Set();
  phases.forEach(p => { boundaries.add(p.week_start); boundaries.add(p.week_end + 1); });
  boundaries.forEach(w => {
    if (w === 0 || w === nWeeks) return;
    chartG.append("line")
      .attr("x1", x(w)).attr("x2", x(w))
      .attr("y1", 0).attr("y2", CHART_H)
      .attr("stroke", "rgba(255,255,255,0.6)")
      .attr("stroke-width", 0.5)
      .style("pointer-events", "none");
  });

  // ── Weekly km area/line (3-week rolling average for readability) ──
  const rawKm  = weekly.map((w, i) => ({ weekIdx: i + 0.5, km: w.km_total ?? 0 }));
  const smoothKm = rawKm.map((d, i, arr) => {
    const win = arr.slice(Math.max(0, i - 1), i + 2);          // window: prev, curr, next
    const avg = win.reduce((s, v) => s + v.km, 0) / win.length;
    return { weekIdx: d.weekIdx, km: avg };
  });
  const maxKm = d3.max(rawKm, d => d.km) || 1;
  const yKm   = d3.scaleLinear().domain([0, maxKm]).range([CHART_H, 0]);

  const kmArea = d3.area()
    .x(d => x(d.weekIdx))
    .y0(CHART_H)
    .y1(d => yKm(d.km))
    .curve(d3.curveMonotoneX);

  const kmLine = d3.line()
    .x(d => x(d.weekIdx))
    .y(d => yKm(d.km))
    .curve(d3.curveMonotoneX);

  chartG.append("path")
    .datum(smoothKm)
    .attr("fill", "rgba(99,102,241,0.12)")
    .attr("d", kmArea);

  chartG.append("path")
    .datum(smoothKm)
    .attr("fill", "none")
    .attr("stroke", "rgba(99,102,241,0.5)")
    .attr("stroke-width", 1.5)
    .attr("d", kmLine);

  // Max km label
  chartG.append("text")
    .attr("x", 4).attr("y", 14)
    .style("font-size", "11px")
    .style("fill", "#999")
    .style("pointer-events", "none")
    .text(`${Math.round(maxKm)} km/w`);

  // ── Pace trend line (4-week rolling average, inverted: lower pace = higher on chart) ──
  const rawPace = weekly.map((w, i) => ({
    weekIdx: i + 0.5,
    pace: (w.avg_pace != null && w.run_count > 0) ? w.avg_pace : null
  }));

  // 4-week rolling average over active weeks only
  const paceTrend = rawPace.map((d, i, arr) => {
    const window = arr.slice(Math.max(0, i - 3), i + 1).filter(v => v.pace != null);
    if (window.length === 0) return { weekIdx: d.weekIdx, pace: null };
    return { weekIdx: d.weekIdx, pace: window.reduce((s, v) => s + v.pace, 0) / window.length };
  }).filter(d => d.pace != null);

  if (paceTrend.length > 1) {
    const [pMin, pMax] = d3.extent(paceTrend, d => d.pace);
    const pPad = (pMax - pMin) * 0.15 || 0.1;
    // Inverted: lower pace (faster) = higher on chart
    const yPace = d3.scaleLinear()
      .domain([pMax + pPad, pMin - pPad])
      .range([CHART_H - 6, 6]);

    const paceLine = d3.line()
      .x(d => x(d.weekIdx))
      .y(d => yPace(d.pace))
      .curve(d3.curveMonotoneX);

    chartG.append("path")
      .datum(paceTrend)
      .attr("fill", "none")
      .attr("stroke", "#F97316")
      .attr("stroke-width", 1.5)
      .attr("opacity", 0.75)
      .attr("d", paceLine);

    // Pace label (best pace = lowest value)
    const bestPace = pMin;
    const mins = Math.floor(bestPace);
    const secs = Math.round((bestPace - mins) * 60);
    chartG.append("text")
      .attr("x", 4).attr("y", CHART_H - 4)
      .style("font-size", "11px")
      .style("fill", "#F97316")
      .style("opacity", "0.8")
      .style("pointer-events", "none")
      .text(`${mins}:${String(secs).padStart(2, "0")} best pace`);
  }

  // Bottom axis line
  chartG.append("line")
    .attr("x1", 0).attr("x2", innerW)
    .attr("y1", CHART_H).attr("y2", CHART_H)
    .attr("stroke", "rgba(0,0,0,0.08)")
    .attr("stroke-width", 1);

  // ── Zoom feedback overlay (persistent after drag) ──
  const zoomOverlayG = chartG.append("g").attr("class", "zoom-overlay");
  if (APP_STATE.hasZoom && APP_STATE.zoomRange) {
    applyZoomOverlay(zoomOverlayG, APP_STATE.zoomRange, x, innerW, CHART_H);
  }

  // ── Drag selection overlay (drawn live while dragging) ──
  const selectionG = chartG.append("g").attr("class", "drag-selection");

  // Transparent hit area for drag
  const dragArea = chartG.append("rect")
    .attr("x", 0).attr("y", 0)
    .attr("width", innerW).attr("height", CHART_H)
    .attr("fill", "transparent")
    .style("cursor", "crosshair");

  let isDragging = false;
  let startX = 0;

  dragArea.on("mousedown", (event) => {
    isDragging = true;
    const [mx] = d3.pointer(event, dragArea.node());
    startX = Math.max(0, Math.min(innerW, mx));
    event.preventDefault();
  });

  d3.select(window)
    .on("mousemove.overview", (event) => {
      if (!isDragging) return;
      const rect = container.getBoundingClientRect();
      const curX = Math.max(0, Math.min(innerW,
        event.clientX - rect.left - MARGIN.left));
      drawSelectionOverlay(selectionG, startX, curX, innerW, CHART_H, x);
    })
    .on("mouseup.overview", (event) => {
      if (!isDragging) return;
      isDragging = false;
      const rect = container.getBoundingClientRect();
      const endX = Math.max(0, Math.min(innerW,
        event.clientX - rect.left - MARGIN.left));
      const dist = Math.abs(endX - startX);
      selectionG.selectAll("*").remove();

      if (dist < 14) {
        resetZoom();
      } else {
        const x0 = Math.min(startX, endX);
        const x1 = Math.max(startX, endX);
        const weekStart = Math.max(0, Math.round(x.invert(x0)));
        const weekEnd   = Math.min(nWeeks - 1, Math.round(x.invert(x1)) - 1);
        if (weekEnd > weekStart) {
          console.log("[overview] Selected weeks:", weekStart, "→", weekEnd);
          renderDetail(weekStart, weekEnd);
        }
      }
    });

  // ─────────────────────────────────────────────────────────
  // Month labels
  // ─────────────────────────────────────────────────────────
  const labelsG = root.append("g")
    .attr("class", "month-labels")
    .attr("transform", `translate(0,${STRIP_H + CHART_H})`);

  buildMonthTicks(weekly, x, innerW).forEach(tick => {
    labelsG.append("text")
      .attr("x", tick.px)
      .attr("y", 14)
      .style("font-size", "10px")
      .style("fill", "#9CA3AF")
      .style("font-weight", tick.isJanuary ? "600" : "400")
      .style("text-anchor", "middle")
      .text(tick.label);
  });

  // ─────────────────────────────────────────────────────────
  // Legend
  // ─────────────────────────────────────────────────────────
  const legendG = root.append("g")
    .attr("transform", `translate(4,${STRIP_H + CHART_H + MONTH_H})`);

  // km/week swatch
  legendG.append("rect")
    .attr("x", 0).attr("y", 4)
    .attr("width", 12).attr("height", 3)
    .attr("rx", 1)
    .attr("fill", "rgba(99,102,241,0.5)");
  legendG.append("text")
    .attr("x", 16).attr("y", 12)
    .style("font-size", "10px")
    .style("fill", "#9CA3AF")
    .text("km/week");

  // Pace trend swatch
  legendG.append("rect")
    .attr("x", 72).attr("y", 4)
    .attr("width", 12).attr("height", 2)
    .attr("rx", 1)
    .attr("fill", "#F97316")
    .attr("opacity", 0.75);
  legendG.append("text")
    .attr("x", 88).attr("y", 12)
    .style("font-size", "10px")
    .style("fill", "#9CA3AF")
    .text("pace trend (↑ faster)");
}

// ─────────────────────────────────────────────────────────
// Public: resetZoom
// ─────────────────────────────────────────────────────────
export function resetZoom() {
  APP_STATE.zoomRange      = null;
  APP_STATE.hasZoom        = false;
  APP_STATE.selectedPhaseId = null;
  document.getElementById("section-detail").style.display   = "none";
  document.getElementById("heatmap-section").style.display  = "none";
  document.getElementById("eff-label").style.display        = "none";
  d3.select(window)
    .on("mousemove.overview", null)
    .on("mouseup.overview",   null);
  renderOverview();
  console.log("[overview] Reset zoom");
}

// ─────────────────────────────────────────────────────────
// Internal: renderDetail
// ─────────────────────────────────────────────────────────
function renderDetail(weekStart, weekEnd) {
  APP_STATE.zoomRange       = { weekStart, weekEnd };
  APP_STATE.hasZoom         = true;
  APP_STATE.selectedPhaseId = null;

  const weekly     = APP_STATE.weekly;
  const wStart     = weekly[weekStart];
  const wEnd       = weekly[Math.min(weekEnd, weekly.length - 1)];
  const labelStart = wStart ? formatWeekLabel(wStart.week) : "";
  const labelEnd   = wEnd   ? formatWeekLabel(wEnd.week)   : "";
  document.getElementById("zoom-label").textContent =
    labelStart === labelEnd ? labelStart : `${labelStart} – ${labelEnd}`;

  renderZoomDetail(weekStart, weekEnd);

  // Re-render overview to apply dimming feedback
  renderOverview();
}

// ─────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────

function getOrCreateTooltip() {
  let tip = d3.select("body").select(".ov-tooltip");
  if (tip.empty()) {
    tip = d3.select("body").append("div").attr("class", "tooltip ov-tooltip");
  }
  return tip.style("display", "none");
}

function getPhaseOpacity(phase) {
  if (!APP_STATE.hasZoom || !APP_STATE.zoomRange) return 1;
  const { weekStart, weekEnd } = APP_STATE.zoomRange;
  return (phase.week_end >= weekStart && phase.week_start <= weekEnd) ? 1.0 : 0.4;
}

function applyZoomOverlay(g, zoomRange, x, innerW, chartH) {
  const { weekStart, weekEnd } = zoomRange;
  const x0 = x(weekStart);
  const x1 = x(weekEnd + 1);

  if (x0 > 0) {
    g.append("rect")
      .attr("x", 0).attr("y", 0)
      .attr("width", x0).attr("height", chartH)
      .attr("fill", "rgba(0,0,0,0.15)")
      .style("pointer-events", "none");
  }
  if (x1 < innerW) {
    g.append("rect")
      .attr("x", x1).attr("y", 0)
      .attr("width", innerW - x1).attr("height", chartH)
      .attr("fill", "rgba(0,0,0,0.15)")
      .style("pointer-events", "none");
  }
  g.append("rect")
    .attr("x", x0).attr("y", 0)
    .attr("width", x1 - x0).attr("height", chartH)
    .attr("fill", "none")
    .attr("stroke", "rgba(60,60,60,0.5)")
    .attr("stroke-width", 1)
    .attr("rx", 2)
    .style("pointer-events", "none");
}

function drawSelectionOverlay(g, startX, curX, innerW, chartH, x) {
  g.selectAll("*").remove();
  const x0   = Math.min(startX, curX);
  const x1   = Math.max(startX, curX);
  const selW = x1 - x0;

  if (x0 > 0) {
    g.append("rect")
      .attr("x", 0).attr("y", 0)
      .attr("width", x0).attr("height", chartH)
      .attr("fill", "rgba(0,0,0,0.15)");
  }
  if (x1 < innerW) {
    g.append("rect")
      .attr("x", x1).attr("y", 0)
      .attr("width", innerW - x1).attr("height", chartH)
      .attr("fill", "rgba(0,0,0,0.15)");
  }
  g.append("rect")
    .attr("x", x0).attr("y", 0)
    .attr("width", selW).attr("height", chartH)
    .attr("fill", "none")
    .attr("stroke", "rgba(60,60,60,0.5)")
    .attr("stroke-width", 1)
    .attr("rx", 2);

  if (selW > 40) {
    const weekCount = Math.round(x.invert(x1) - x.invert(x0));
    const cx = x0 + selW / 2;
    const cy = chartH / 2;
    const label = `${weekCount} week${weekCount !== 1 ? "s" : ""}`;
    const bw = label.length * 6 + 14;

    g.append("rect")
      .attr("x", cx - bw / 2).attr("y", cy - 10)
      .attr("width", bw).attr("height", 18)
      .attr("rx", 9)
      .attr("fill", "white")
      .attr("stroke", "#E5E7EB")
      .attr("stroke-width", 1);

    g.append("text")
      .attr("x", cx).attr("y", cy + 1)
      .attr("text-anchor", "middle")
      .attr("dominant-baseline", "middle")
      .style("font-size", "10px")
      .style("fill", "#374151")
      .style("pointer-events", "none")
      .text(label);
  }
}


// Build month tick labels, every 2 months, skip if they'd overlap
function buildMonthTicks(weekly, x, innerW) {
  const ticks    = [];
  let lastPx     = -100;
  let lastMonth  = null;
  let monthCount = 0;

  weekly.forEach((w, i) => {
    if (!w.week) return;
    const dateStr = w.week.includes("/") ? w.week.split("/")[0] : w.week;
    const d = new Date(dateStr + "T00:00:00");
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    if (key === lastMonth) return;
    lastMonth = key;
    monthCount++;

    if (monthCount % 2 !== 0) return; // every 2 months

    const px = x(i);
    if (px < 4 || px > innerW - 4) return; // skip edges
    if (px - lastPx < 4) return;           // no overlap
    lastPx = px;

    const isJanuary = d.getMonth() === 0;
    const label = d.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
    ticks.push({ px, label, isJanuary });
  });
  return ticks;
}
