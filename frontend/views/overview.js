import APP_STATE from "../js/state.js";
import { phaseColor, phaseTextColor, PHASE_SCALE } from "../js/colors.js";
import { formatWeekLabel, showTooltip, moveTooltip, hideTooltip } from "../js/utils.js";
import { renderDetail as renderZoomDetail } from "./zoomTimeline.js";

const STRIP_H    = 32;
const STRIP_LEG  = 44;
const CHART_H    = 480;
const AXIS_H     = 40;
const LEGEND_H   = 26;
const MARGIN     = { top: 16, right: 20, bottom: 10, left: 60 };

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
  const totalH  = MARGIN.top + STRIP_LEG + STRIP_H + CHART_H + AXIS_H + LEGEND_H + MARGIN.bottom;

  const x = d3.scaleLinear().domain([0, nWeeks]).range([0, innerW]);

  const svg = d3.select(container)
    .append("svg")
    .attr("width", W)
    .attr("height", totalH);

  // ── Defs ──
  const defs = svg.append("defs");
  const pat = defs.append("pattern")
    .attr("id", "inactive-stripe")
    .attr("patternUnits", "userSpaceOnUse")
    .attr("width", 6).attr("height", 6);
  pat.append("rect").attr("width", 6).attr("height", 6).attr("fill", "#E5E7EB");
  pat.append("path")
    .attr("d", "M-1,1 l2,-2 M0,6 l6,-6 M5,7 l2,-2")
    .attr("stroke", "#D1D5DB").attr("stroke-width", 1);

  const root = svg.append("g")
    .attr("transform", `translate(${MARGIN.left},${MARGIN.top})`);

  const tooltip = getOrCreateTooltip();

  const activePhases   = phases.filter(p => p.type === "Active");
  const inactivePhases = phases.filter(p => p.type === "Inactive");

  // ─────────────────────────────────────────────────────────
  // ROW 1 — Phase color legend + drag hint
  // ─────────────────────────────────────────────────────────
  const legBarG = root.append("g").attr("class", "volume-legend");

  const cy = STRIP_LEG / 2;

  // Fixed legend — one entry per phase type
  const PHASE_DESCRIPTIONS = {
    "Building":   "Volume is growing week over week. The body is adapting to increasing load — a preparation stage before peak training.",
    "Peak":       "Highest training load of the cycle. Volume is at maximum and stable. Typically the hardest period before a race.",
    "Base":       "Steady, moderate volume. No clear growth or drop. Maintaining fitness and consistency — the most common phase.",
    "Recovery":   "Volume is significantly below normal. Usually follows a peak or race, or reflects illness / low motivation.",
    "Sharpening": "Volume drops while pace improves. Classic pre-race tapering — less km but higher quality. Body is getting sharp.",
  };

  const usedNames = new Set(activePhases.map(p => p.name));
  let lx = 0;

  // Rest indicator — first (least intense)
  const restItemW = 16 + 4 * 7 + 18;
  const restG = legBarG.append("g")
    .style("cursor", "default")
    .on("mouseover", (event) => {
      showTooltip(tooltip, event,
        `<div style="font-weight:700;font-size:14px;color:#6B7280;margin-bottom:6px">Rest</div>
         <div style="color:#9CA3AF;font-size:12px;line-height:1.6;max-width:200px">No running activity for 10+ days. Gap between training blocks.</div>`);
    })
    .on("mousemove", (event) => moveTooltip(tooltip, event))
    .on("mouseout", () => hideTooltip(tooltip));

  restG.append("circle")
    .attr("cx", lx + 6).attr("cy", cy).attr("r", 6)
    .attr("fill", "#E5E7EB").attr("stroke", "#D1D5DB").attr("stroke-width", 1);
  restG.append("text")
    .attr("x", lx + 16).attr("y", cy)
    .attr("dominant-baseline", "middle")
    .style("font-size", "12px").style("fill", "#374151").style("font-weight", "500")
    .text("Rest");
  restG.append("rect")
    .attr("x", lx).attr("y", cy - 10)
    .attr("width", restItemW).attr("height", 20)
    .attr("fill", "transparent");
  lx += restItemW;

  PHASE_SCALE.filter(p => usedNames.has(p.name)).forEach(p => {
    const itemW = 16 + p.label.length * 7 + 18;
    const itemG = legBarG.append("g")
      .style("cursor", "default")
      .on("mouseover", (event) => {
        showTooltip(tooltip, event,
          `<div style="font-weight:700;font-size:14px;color:${p.bg};margin-bottom:6px">${p.label}</div>
           <div style="color:#6B7280;font-size:12px;line-height:1.6;max-width:220px">${PHASE_DESCRIPTIONS[p.name] ?? ""}</div>`);
      })
      .on("mousemove", (event) => moveTooltip(tooltip, event))
      .on("mouseout", () => hideTooltip(tooltip));

    itemG.append("circle")
      .attr("cx", lx + 6).attr("cy", cy).attr("r", 6)
      .attr("fill", p.bg).attr("opacity", 0.9);
    itemG.append("text")
      .attr("x", lx + 16).attr("y", cy)
      .attr("dominant-baseline", "middle")
      .style("font-size", "12px").style("fill", "#374151").style("font-weight", "500")
      .text(p.label);

    // invisible hit area
    itemG.append("rect")
      .attr("x", lx).attr("y", cy - 10)
      .attr("width", itemW).attr("height", 20)
      .attr("fill", "transparent");

    lx += itemW;
  });

  // Drag hint — right-aligned
  legBarG.append("text")
    .attr("x", innerW).attr("y", cy)
    .attr("text-anchor", "end").attr("dominant-baseline", "middle")
    .style("font-size", "14px").style("fill", "#9CA3AF")
    .text("drag any period to explore in detail →");

  // ─────────────────────────────────────────────────────────
  // ROW 2 — Phase strip
  // ─────────────────────────────────────────────────────────
  const stripG = root.append("g")
    .attr("class", "phase-strip")
    .attr("transform", `translate(0,${STRIP_LEG})`);

  // Base background
  stripG.append("rect")
    .attr("width", innerW).attr("height", STRIP_H)
    .attr("fill", "#F3F4F6");

  function drawStripSegments(phaseList) {
    phaseList.forEach(phase => {
      const px1      = x(phase.week_start);
      const px2      = x(phase.week_end + 1);
      const bw       = Math.max(1, px2 - px1);
      const isInactive = phase.type === "Inactive";
      const opacity  = getPhaseOpacity(phase);
      const s        = phase.stats || {};
      const weeks    = phase.week_end - phase.week_start + 1;

      // Background rect
      stripG.append("rect")
        .attr("x", px1).attr("y", 0)
        .attr("width", bw).attr("height", STRIP_H)
        .attr("fill", isInactive ? "url(#inactive-stripe)" : phaseColor(phase.name))
        .attr("opacity", opacity)
        .attr("class", `strip-seg seg-${phase.id}`)
        .style("cursor", isInactive ? "default" : "pointer")
        .on("mouseover", (event) => {
          const tc  = isInactive ? "#6B7280" : phaseTextColor(phase.name);
          const km  = s.km_per_week != null ? s.km_per_week.toFixed(1) : "—";
          const tot = s.total_km    != null ? s.total_km.toFixed(0)    : "—";
          const pac = s.avg_pace    != null ? fmtPaceShort(s.avg_pace) : "—";
          const html = isInactive
            ? `<div style="font-weight:700;font-size:14px;color:#6B7280;margin-bottom:5px">Rest / Inactive</div>
               <div style="font-size:12px;color:#9CA3AF">${weeks} weeks off</div>`
            : `<div style="font-weight:700;font-size:15px;color:${tc};margin-bottom:9px">${phase.name}</div>
               <div style="display:flex;flex-direction:column;gap:5px;font-size:13px">
                 <div><span style="color:#9CA3AF;display:inline-block;width:46px">weeks</span>${weeks}</div>
                 <div><span style="color:#9CA3AF;display:inline-block;width:46px">avg</span>${km} km/w</div>
                 <div><span style="color:#9CA3AF;display:inline-block;width:46px">total</span>${tot} km</div>
                 <div><span style="color:#9CA3AF;display:inline-block;width:46px">pace</span>${pac}</div>
               </div>`;
          showTooltip(tooltip, event, html);
        })
        .on("mousemove", (event) => {
          moveTooltip(tooltip, event);
        })
        .on("mouseout", () => hideTooltip(tooltip))
        .on("click", () => {
          if (isInactive) return;
          renderDetail(phase.week_start, phase.week_end);
        });

      // No labels in overview strip — colors + legend above are sufficient

      // Separator line
      if (bw > 1) {
        stripG.append("line")
          .attr("x1", px2).attr("x2", px2)
          .attr("y1", 0).attr("y2", STRIP_H)
          .attr("stroke", "white").attr("stroke-width", 1.5)
          .style("pointer-events", "none");
      }
    });
  }

  drawStripSegments(activePhases);
  drawStripSegments(inactivePhases);

  // Bottom border of strip
  stripG.append("line")
    .attr("x1", 0).attr("x2", innerW)
    .attr("y1", STRIP_H).attr("y2", STRIP_H)
    .attr("stroke", "rgba(0,0,0,0.08)").attr("stroke-width", 1);

  // ─────────────────────────────────────────────────────────
  // ROW 2 — Chart area
  // ─────────────────────────────────────────────────────────
  const chartG = root.append("g")
    .attr("class", "chart-area")
    .attr("transform", `translate(0,${STRIP_LEG + STRIP_H})`);

  // Chart background
  chartG.append("rect")
    .attr("width", innerW).attr("height", CHART_H)
    .attr("fill", "#FAFAFA");

  // Phase coloured background bands
  activePhases.forEach(phase => {
    chartG.append("rect")
      .attr("x", x(phase.week_start)).attr("y", 0)
      .attr("width", Math.max(0, x(phase.week_end + 1) - x(phase.week_start)))
      .attr("height", CHART_H)
      .attr("fill", phaseColor(phase.name))
      .attr("opacity", 0.07);
  });

  // ── Weekly km scale ──
  const rawKm  = weekly.map((w, i) => ({ weekIdx: i + 0.5, km: w.km_total ?? 0 }));
  const smoothKm = rawKm.map((d, i, arr) => {
    // Don't smooth across zero-km (inactive) weeks — keep them at 0
    if (d.km === 0) return { weekIdx: d.weekIdx, km: 0 };
    const win = arr.slice(Math.max(0, i - 1), i + 2).filter(v => v.km > 0);
    return { weekIdx: d.weekIdx, km: win.reduce((s, v) => s + v.km, 0) / win.length };
  });
  const maxKm  = d3.max(rawKm, d => d.km) || 1;
  const niceMax = Math.ceil(maxKm / 10) * 10;
  const yKm    = d3.scaleLinear().domain([0, niceMax]).range([CHART_H, 0]);

  // ── Grid lines + left Y-axis (km/week) ──
  const kmTicks = yKm.ticks(5);
  kmTicks.forEach(val => {
    const yy = yKm(val);
    // Grid line
    chartG.append("line")
      .attr("x1", 0).attr("x2", innerW)
      .attr("y1", yy).attr("y2", yy)
      .attr("stroke", val === 0 ? "rgba(0,0,0,0.18)" : "rgba(0,0,0,0.08)")
      .attr("stroke-width", val === 0 ? 1.5 : 0.75)
      .attr("stroke-dasharray", val === 0 ? "none" : "3,4");
    // Tick mark
    if (val !== 0) {
      chartG.append("line")
        .attr("x1", -4).attr("x2", 0)
        .attr("y1", yy).attr("y2", yy)
        .attr("stroke", "rgba(0,0,0,0.25)").attr("stroke-width", 1);
    }
    // Axis label (left)
    chartG.append("text")
      .attr("x", -10).attr("y", yy)
      .attr("text-anchor", "end").attr("dominant-baseline", "middle")
      .style("font-size", "13px").style("fill", "#4B5563").style("font-weight", "600")
      .text(val === 0 ? "" : val);
  });

  // Left axis title
  chartG.append("text")
    .attr("transform", `translate(-46,${CHART_H / 2}) rotate(-90)`)
    .attr("text-anchor", "middle")
    .style("font-size", "12px").style("fill", "rgba(99,102,241,0.9)").style("font-weight", "700")
    .text("km / week");

  // ── Km area + line ──
  const kmArea = d3.area()
    .x(d => x(d.weekIdx)).y0(CHART_H).y1(d => yKm(d.km))
    .curve(d3.curveMonotoneX);
  // Build set of week indices that belong to inactive phases
  const inactiveWeekSet = new Set();
  inactivePhases.forEach(p => {
    for (let w = p.week_start; w <= p.week_end; w++) inactiveWeekSet.add(w);
  });
  const isInactiveIdx = weekIdx => inactiveWeekSet.has(Math.floor(weekIdx));

  // Active-only line — breaks across inactive phases
  const kmLine = d3.line()
    .defined(d => !isInactiveIdx(d.weekIdx))
    .x(d => x(d.weekIdx)).y(d => yKm(d.km))
    .curve(d3.curveMonotoneX);

  // Dashed bridge line across inactive gaps
  const kmBridge = d3.line()
    .x(d => x(d.weekIdx)).y(d => yKm(d.km))
    .curve(d3.curveLinear);

  chartG.append("path").datum(smoothKm)
    .attr("fill", "rgba(99,102,241,0.12)").attr("d", kmArea);

  // Dashed bridges across each inactive phase
  inactivePhases.forEach(p => {
    const before = smoothKm.filter(d => Math.floor(d.weekIdx) === p.week_start - 1);
    const after  = smoothKm.filter(d => Math.floor(d.weekIdx) === p.week_end + 1);
    if (before.length && after.length) {
      chartG.append("path")
        .datum([before[before.length - 1], after[0]])
        .attr("fill", "none")
        .attr("stroke", "rgba(99,102,241,0.28)")
        .attr("stroke-width", 1.2)
        .attr("stroke-dasharray", "4,5")
        .attr("d", kmBridge);
    }
  });

  // Solid line for active portions
  chartG.append("path").datum(smoothKm)
    .attr("fill", "none")
    .attr("stroke", "rgba(99,102,241,0.6)")
    .attr("stroke-width", 1.8)
    .attr("d", kmLine);


  // Phase boundary lines
  const boundaries = new Set();
  phases.forEach(p => { boundaries.add(p.week_start); boundaries.add(p.week_end + 1); });
  boundaries.forEach(w => {
    if (w === 0 || w === nWeeks) return;
    chartG.append("line")
      .attr("x1", x(w)).attr("x2", x(w))
      .attr("y1", 0).attr("y2", CHART_H)
      .attr("stroke", "rgba(0,0,0,0.1)").attr("stroke-width", 1)
      .attr("stroke-dasharray", "2,3")
      .style("pointer-events", "none");
  });

  // Chart bottom border
  chartG.append("line")
    .attr("x1", 0).attr("x2", innerW)
    .attr("y1", CHART_H).attr("y2", CHART_H)
    .attr("stroke", "rgba(0,0,0,0.12)").attr("stroke-width", 1);

  // ── Zoom overlay ──
  const zoomOverlayG = chartG.append("g").attr("class", "zoom-overlay");
  if (APP_STATE.hasZoom && APP_STATE.zoomRange) {
    applyZoomOverlay(zoomOverlayG, APP_STATE.zoomRange, x, innerW, CHART_H);
  }

  // ── Hover crosshair + tooltip ──
  const crossG = chartG.append("g").attr("class", "crosshair").style("pointer-events", "none");
  const crossLine = crossG.append("line")
    .attr("y1", 0).attr("y2", CHART_H)
    .attr("stroke", "rgba(0,0,0,0.2)").attr("stroke-width", 1)
    .attr("stroke-dasharray", "3,3").style("display", "none");

  // ── Drag selection ──
  const selectionG = chartG.append("g").attr("class", "drag-selection");

  const dragArea = chartG.append("rect")
    .attr("x", 0).attr("y", 0)
    .attr("width", innerW).attr("height", CHART_H)
    .attr("fill", "transparent")
    .style("cursor", "crosshair");

  // Hover: show crosshair + tooltip with weekly data
  dragArea.on("mousemove", (event) => {
    if (isDragging) return;
    const [mx] = d3.pointer(event, dragArea.node());
    const weekIdx = Math.floor(x.invert(mx));
    if (weekIdx < 0 || weekIdx >= weekly.length) { hideTooltip(tooltip); return; }
    const w = weekly[weekIdx];
    if (!w) return;

    crossLine.style("display", null).attr("x1", mx).attr("x2", mx);

    const parts = w.week ? w.week.split("/") : [];
    const dFrom = parts[0] ? new Date(parts[0] + "T00:00:00") : null;
    const dTo   = parts[1] ? new Date(parts[1] + "T00:00:00") : null;
    const fmtD  = d => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    const fmtDY = d => d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    const weekLabel = dFrom && dTo
      ? `${fmtD(dFrom)} – ${fmtDY(dTo)}`
      : dFrom ? fmtDY(dFrom) : "";
    const km  = w.km_total  != null ? w.km_total.toFixed(1)  : "—";
    const pac = w.avg_pace  != null ? fmtPaceShort(w.avg_pace) : "—";
    const runs = w.run_count ?? "—";
    const html = `
      <div style="font-size:12px;color:#9CA3AF;margin-bottom:5px">${weekLabel}</div>
      <div style="font-weight:700;font-size:17px;margin-bottom:9px">${km} km</div>
      <div style="display:flex;flex-direction:column;gap:5px;font-size:13px">
        <div><span style="color:#9CA3AF;display:inline-block;width:46px">runs</span>${runs}</div>
        <div><span style="color:#9CA3AF;display:inline-block;width:46px">pace</span>${pac}</div>
      </div>`;
    showTooltip(tooltip, event, html);
  });
  dragArea.on("mouseleave", () => {
    crossLine.style("display", "none");
    hideTooltip(tooltip);
  });

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
      const curX = Math.max(0, Math.min(innerW, event.clientX - rect.left - MARGIN.left));
      drawSelectionOverlay(selectionG, startX, curX, innerW, CHART_H, x);
    })
    .on("mouseup.overview", (event) => {
      if (!isDragging) return;
      isDragging = false;
      const rect = container.getBoundingClientRect();
      const endX = Math.max(0, Math.min(innerW, event.clientX - rect.left - MARGIN.left));
      const dist = Math.abs(endX - startX);
      selectionG.selectAll("*").remove();

      if (dist < 14) {
        resetZoom();
      } else {
        const x0 = Math.min(startX, endX);
        const x1 = Math.max(startX, endX);
        const weekStart = Math.max(0, Math.round(x.invert(x0)));
        const weekEnd   = Math.min(nWeeks - 1, Math.round(x.invert(x1)) - 1);
        if (weekEnd > weekStart) renderDetail(weekStart, weekEnd);
      }
    });

  // ─────────────────────────────────────────────────────────
  // ROW 3 — Month / time axis
  // ─────────────────────────────────────────────────────────
  const axisG = root.append("g")
    .attr("class", "time-axis")
    .attr("transform", `translate(0,${STRIP_LEG + STRIP_H + CHART_H})`);

  // Axis baseline
  axisG.append("line")
    .attr("x1", 0).attr("x2", innerW).attr("y1", 0).attr("y2", 0)
    .attr("stroke", "rgba(0,0,0,0.1)").attr("stroke-width", 1);

  // Week tick marks — one small notch per week
  weekly.forEach((_, i) => {
    const px = x(i);
    if (px < 0 || px > innerW) return;
    axisG.append("line")
      .attr("x1", px).attr("x2", px)
      .attr("y1", 0).attr("y2", 3)
      .attr("stroke", "rgba(0,0,0,0.12)")
      .attr("stroke-width", 0.5);
  });

  buildMonthTicks(weekly, x, innerW).forEach(tick => {
    // Tick mark
    axisG.append("line")
      .attr("x1", tick.px).attr("x2", tick.px)
      .attr("y1", 0).attr("y2", tick.isJanuary ? 9 : 6)
      .attr("stroke", tick.isJanuary ? "rgba(0,0,0,0.35)" : "rgba(0,0,0,0.18)")
      .attr("stroke-width", tick.isJanuary ? 1.5 : 1);

    axisG.append("text")
      .attr("x", tick.px).attr("y", tick.isJanuary ? 22 : 19)
      .style("font-size", tick.isJanuary ? "11px" : "10px")
      .style("font-weight", tick.isJanuary ? "700" : "400")
      .style("fill", tick.isJanuary ? "#374151" : "#9CA3AF")
      .style("text-anchor", "middle")
      .text(tick.label);
  });

  // ─────────────────────────────────────────────────────────
  // ROW 4 — Legend
  // ─────────────────────────────────────────────────────────
  const legendG = root.append("g")
    .attr("transform", `translate(0,${STRIP_LEG + STRIP_H + CHART_H + AXIS_H})`);

  // km/week swatch
  legendG.append("rect").attr("x", 0).attr("y", 5).attr("width", 14).attr("height", 4)
    .attr("rx", 2).attr("fill", "rgba(99,102,241,0.5)");
  legendG.append("text").attr("x", 20).attr("y", 13)
    .style("font-size", "10px").style("fill", "#9CA3AF").text("weekly km");
}

// ─────────────────────────────────────────────────────────
// Public: resetZoom
// ─────────────────────────────────────────────────────────
export function resetZoom() {
  APP_STATE.zoomRange       = null;
  APP_STATE.hasZoom         = false;
  APP_STATE.selectedPhaseId = null;
  APP_STATE.selectedWeekIdx = null;
  document.getElementById("section-detail").style.display      = "none";
  document.getElementById("heatmap-section").style.display     = "none";
document.getElementById("bp-detail-panel").style.display     = "none";
  document.getElementById("week-detail-section").style.display = "none";
  d3.select(window).on("mousemove.overview", null).on("mouseup.overview", null);
  renderOverview();
}

// ─────────────────────────────────────────────────────────
// Internal: renderDetail
// ─────────────────────────────────────────────────────────
function renderDetail(weekStart, weekEnd) {
  APP_STATE.zoomRange       = { weekStart, weekEnd };
  APP_STATE.hasZoom         = true;
  APP_STATE.selectedPhaseId = null;
  APP_STATE.selectedWeekIdx = null;
  document.getElementById("bp-detail-panel").style.display     = "none";
  document.getElementById("week-detail-section").style.display = "none";

  const weekly     = APP_STATE.weekly;
  const wStart     = weekly[weekStart];
  const wEnd       = weekly[Math.min(weekEnd, weekly.length - 1)];
  const labelStart = wStart ? formatWeekLabel(wStart.week) : "";
  const labelEnd   = wEnd   ? formatWeekLabel(wEnd.week)   : "";
  document.getElementById("zoom-label").textContent =
    labelStart === labelEnd ? labelStart : `${labelStart} – ${labelEnd}`;

  renderZoomDetail(weekStart, weekEnd);
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
  return (phase.week_end >= weekStart && phase.week_start <= weekEnd) ? 1.0 : 0.35;
}

function applyZoomOverlay(g, zoomRange, x, innerW, chartH) {
  const { weekStart, weekEnd } = zoomRange;
  const x0 = x(weekStart);
  const x1 = x(weekEnd + 1);

  if (x0 > 0) {
    g.append("rect").attr("x", 0).attr("y", 0)
      .attr("width", x0).attr("height", chartH)
      .attr("fill", "rgba(0,0,0,0.12)").style("pointer-events", "none");
  }
  if (x1 < innerW) {
    g.append("rect").attr("x", x1).attr("y", 0)
      .attr("width", innerW - x1).attr("height", chartH)
      .attr("fill", "rgba(0,0,0,0.12)").style("pointer-events", "none");
  }
  g.append("rect").attr("x", x0).attr("y", 0)
    .attr("width", x1 - x0).attr("height", chartH)
    .attr("fill", "none")
    .attr("stroke", "rgba(60,60,60,0.45)").attr("stroke-width", 1.5).attr("rx", 2)
    .style("pointer-events", "none");
}

function drawSelectionOverlay(g, startX, curX, innerW, chartH, x) {
  g.selectAll("*").remove();
  const x0  = Math.min(startX, curX);
  const x1  = Math.max(startX, curX);
  const selW = x1 - x0;

  if (x0 > 0) {
    g.append("rect").attr("x", 0).attr("y", 0)
      .attr("width", x0).attr("height", chartH).attr("fill", "rgba(0,0,0,0.12)");
  }
  if (x1 < innerW) {
    g.append("rect").attr("x", x1).attr("y", 0)
      .attr("width", innerW - x1).attr("height", chartH).attr("fill", "rgba(0,0,0,0.12)");
  }
  g.append("rect").attr("x", x0).attr("y", 0)
    .attr("width", selW).attr("height", chartH)
    .attr("fill", "none").attr("stroke", "rgba(60,60,60,0.5)").attr("stroke-width", 1.5).attr("rx", 2);

  if (selW > 40) {
    const weekCount = Math.round(x.invert(x1) - x.invert(x0));
    const cx = x0 + selW / 2;
    const cy = chartH / 2;
    const label = `${weekCount}w`;
    const bw = label.length * 7 + 16;

    g.append("rect")
      .attr("x", cx - bw / 2).attr("y", cy - 10)
      .attr("width", bw).attr("height", 18).attr("rx", 9)
      .attr("fill", "white").attr("stroke", "#E5E7EB").attr("stroke-width", 1);
    g.append("text")
      .attr("x", cx).attr("y", cy + 1)
      .attr("text-anchor", "middle").attr("dominant-baseline", "middle")
      .style("font-size", "10px").style("fill", "#374151").style("pointer-events", "none")
      .text(label);
  }
}

function fmtPaceShort(minPerKm) {
  if (!minPerKm || isNaN(minPerKm)) return "—";
  const min = Math.floor(minPerKm);
  const sec = Math.round((minPerKm - min) * 60);
  return `${min}:${sec.toString().padStart(2, "0")}`;
}

// Build month ticks — every month, bold on January (year change)
function buildMonthTicks(weekly, x, innerW) {
  const ticks   = [];
  let lastMonth = null;
  let lastPx    = -999;
  let isFirst   = true;

  weekly.forEach((w, i) => {
    if (!w.week) return;
    const dateStr = w.week.includes("/") ? w.week.split("/")[0] : w.week;
    const d = new Date(dateStr + "T00:00:00");
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    if (key === lastMonth) return;
    lastMonth = key;

    const px = x(i);
    if (px < 6 || px > innerW - 6) return;

    const isJanuary = d.getMonth() === 0;
    const showYear  = isJanuary || isFirst;
    const minGap    = showYear ? 30 : 22;
    if (px - lastPx < minGap) return;
    lastPx = px;

    const label = showYear
      ? d.toLocaleDateString("en-US", { month: "short", year: "numeric" })
      : d.toLocaleDateString("en-US", { month: "short" });

    ticks.push({ px, label, isJanuary: showYear });
    isFirst = false;
  });
  return ticks;
}
