import APP_STATE from "../js/state.js";
import { phaseColor, phaseTextColor } from "../js/colors.js";
import { showTooltip, hideTooltip } from "../js/utils.js";

const HEIGHT = 120;
const MARGIN = { top: 24, right: 60, bottom: 28, left: 40 };

// ─────────────────────────────────────────────────────────
// Public: renderEfficiency
// ─────────────────────────────────────────────────────────
export function renderEfficiency(weekStart, weekEnd) {
  const container = document.getElementById("efficiency-chart");
  const effLabel  = document.getElementById("eff-label");
  container.innerHTML = "";

  const { meta, weekly, phases, zoomRange } = APP_STATE;

  // Resolve range
  const ws = weekStart ?? zoomRange?.weekStart;
  const we = weekEnd   ?? zoomRange?.weekEnd;

  if (!meta.has_hr) {
    effLabel.style.display    = "none";
    container.style.display   = "none";
    return;
  }

  effLabel.style.display  = "block";
  container.style.display = "block";

  if (ws == null || we == null) return;

  const sliceWeeks = weekly.slice(ws, we + 1);
  const withEff    = sliceWeeks
    .map((w, i) => ({ ...w, weekIdx: ws + i }))
    .filter(w => w.efficiency != null && w.efficiency > 0);

  console.log("[efficiency] Weeks with HR:", withEff.length, "of", sliceWeeks.length);

  if (withEff.length < 2) {
    container.innerHTML = '<p class="no-data-msg">Not enough heart rate data in this period.</p>';
    return;
  }

  // ── Scales ──
  const W      = container.clientWidth || 880;
  const innerW = W - MARGIN.left - MARGIN.right;
  const innerH = HEIGHT - MARGIN.top - MARGIN.bottom;

  const xScale = d3.scaleLinear()
    .domain([ws, we])
    .range([MARGIN.left, W - MARGIN.right]);

  const [eMin, eMax] = d3.extent(withEff, d => d.efficiency);
  const pad = (eMax - eMin) * 0.15 || 0.001;

  const yScale = d3.scaleLinear()
    .domain([eMin - pad, eMax + pad])
    .range([HEIGHT - MARGIN.bottom, MARGIN.top]);

  // ── Trend regression ──
  const n     = withEff.length;
  const xMean = (n - 1) / 2;
  const yMean = d3.mean(withEff, d => d.efficiency);
  const slope = d3.sum(withEff, (d, i) => (i - xMean) * (d.efficiency - yMean))
              / d3.sum(withEff, (_, i) => (i - xMean) ** 2);
  const significant = Math.abs(slope) > (yMean * 0.0005);

  let trendLabel, trendColor;
  if (significant && slope > 0) {
    trendLabel = "↑ improving"; trendColor = "#3B6D11";
  } else if (significant && slope < 0) {
    trendLabel = "↓ declining"; trendColor = "#993C1D";
  } else {
    trendLabel = "→ stable";   trendColor = "#6B7280";
  }

  const trendStr = significant ? (slope > 0 ? "improving" : "declining") : "stable";
  console.log("[efficiency] Trend:", trendStr, "slope:", slope.toFixed(8));

  // ── SVG ──
  const svg = d3.select(container)
    .append("svg")
    .attr("width", W)
    .attr("height", HEIGHT);

  // ── Phase background bands ──
  const phasesInRange = phases.filter(p =>
    p.week_end >= ws && p.week_start <= we
  );

  phasesInRange.forEach(phase => {
    const x1 = xScale(Math.max(phase.week_start, ws));
    const x2 = xScale(Math.min(phase.week_end, we));
    if (x2 <= x1) return;
    svg.append("rect")
      .attr("x", x1).attr("y", MARGIN.top)
      .attr("width", x2 - x1)
      .attr("height", innerH)
      .attr("fill",    phase.type === "Inactive" ? "#E5E7EB" : phaseColor(phase.name))
      .attr("opacity", phase.type === "Inactive" ? 0.4 : 0.10);
  });

  // ── Average reference line ──
  const avgEff = d3.mean(withEff, d => d.efficiency);
  const avgY   = yScale(avgEff);

  svg.append("line")
    .attr("x1", MARGIN.left).attr("x2", W - MARGIN.right)
    .attr("y1", avgY).attr("y2", avgY)
    .attr("stroke", "#9CA3AF")
    .attr("stroke-width", 0.7)
    .attr("stroke-dasharray", "4 3");

  svg.append("text")
    .attr("x", W - MARGIN.right + 4)
    .attr("y", avgY + 3)
    .style("font-size", "9px")
    .style("fill", "#9CA3AF")
    .text("avg " + avgEff.toFixed(4));

  // ── Colored line — per phase segment ──
  // Group consecutive weeks by phase_id
  const segments = [];
  let cur = null;
  withEff.forEach(w => {
    if (!cur || cur.phaseId !== w.phase_id) {
      cur = { phaseId: w.phase_id, points: [] };
      segments.push(cur);
    }
    cur.points.push(w);
  });

  const tooltip = getOrCreateTooltip();

  const lineGen = d3.line()
    .x(d => xScale(d.weekIdx))
    .y(d => yScale(d.efficiency))
    .curve(d3.curveMonotoneX);

  segments.forEach(seg => {
    const ph = phases.find(p => p.id === seg.phaseId);
    const color = ph ? phaseColor(ph.name) : "#9CA3AF";
    if (seg.points.length < 2) return;
    svg.append("path")
      .datum(seg.points)
      .attr("fill", "none")
      .attr("stroke", color)
      .attr("stroke-width", 2)
      .attr("d", lineGen);
  });

  // ── Dots ──
  withEff.forEach(w => {
    const ph    = phases.find(p => p.id === w.phase_id);
    const color = ph ? phaseColor(ph.name) : "#9CA3AF";
    const pName = ph ? ph.name : "Unknown";

    svg.append("circle")
      .attr("cx", xScale(w.weekIdx))
      .attr("cy", yScale(w.efficiency))
      .attr("r", 3.5)
      .attr("fill", color)
      .attr("stroke", "white")
      .attr("stroke-width", 1)
      .style("cursor", "default")
      .on("mouseover", (event) => {
        showTooltip(tooltip, event,
          `<b style="color:${phaseTextColor(pName)}">${pName}</b> · Week ${w.weekIdx + 1} · ${w.efficiency.toFixed(4)}`);
      })
      .on("mousemove", (event) => {
        tooltip.style("left", (event.pageX + 12) + "px")
               .style("top",  (event.pageY - 28) + "px");
      })
      .on("mouseout", () => hideTooltip(tooltip));
  });

  // ── Trend annotation ──
  svg.append("text")
    .attr("x", W - MARGIN.right - 4)
    .attr("y", MARGIN.top + 12)
    .style("font-size", "10px")
    .style("font-weight", "500")
    .style("fill", trendColor)
    .style("text-anchor", "end")
    .text(trendLabel);

  // ── Y-axis ──
  const yTicks = [eMin, avgEff, eMax];
  const yAxisG = svg.append("g").attr("transform", `translate(${MARGIN.left},0)`);

  yTicks.forEach(v => {
    const cy = yScale(v);
    yAxisG.append("line")
      .attr("x1", 0).attr("x2", -4)
      .attr("y1", cy).attr("y2", cy)
      .attr("stroke", "#E5E7EB");
    yAxisG.append("line")
      .attr("x1", 0).attr("x2", innerW)
      .attr("y1", cy).attr("y2", cy)
      .attr("stroke", "#F3F4F6")
      .attr("stroke-width", 0.5);
    yAxisG.append("text")
      .attr("x", -6).attr("y", cy + 3)
      .style("font-size", "9px")
      .style("fill", "#9CA3AF")
      .style("text-anchor", "end")
      .text(v.toFixed(4));
  });

  // Y-axis label
  svg.append("text")
    .attr("transform", `rotate(-90)`)
    .attr("x", -(MARGIN.top + innerH / 2))
    .attr("y", 11)
    .style("font-size", "9px")
    .style("fill", "#9CA3AF")
    .style("text-anchor", "middle")
    .text("efficiency");

  // Y-axis line
  yAxisG.append("line")
    .attr("x1", 0).attr("x2", 0)
    .attr("y1", MARGIN.top).attr("y2", HEIGHT - MARGIN.bottom)
    .attr("stroke", "#E5E7EB");

  // ── X-axis — month labels ──
  const xAxisG = svg.append("g")
    .attr("transform", `translate(0,${HEIGHT - MARGIN.bottom})`);

  xAxisG.append("line")
    .attr("x1", MARGIN.left).attr("x2", W - MARGIN.right)
    .attr("y1", 0).attr("y2", 0)
    .attr("stroke", "#E5E7EB");

  buildMonthTicks(weekly, ws, we, xScale).forEach(tick => {
    xAxisG.append("line")
      .attr("x1", tick.px).attr("x2", tick.px)
      .attr("y1", 0).attr("y2", 4)
      .attr("stroke", "#D1D5DB");
    xAxisG.append("text")
      .attr("x", tick.px).attr("y", 14)
      .style("font-size", "9px")
      .style("fill", "#9CA3AF")
      .style("text-anchor", "middle")
      .text(tick.label);
  });

  // ── Phase legend ──
  const usedPhaseIds = [...new Set(withEff.map(w => w.phase_id).filter(Boolean))];
  const usedPhases   = usedPhaseIds
    .map(id => phases.find(p => p.id === id))
    .filter(Boolean);

  if (usedPhases.length > 0) {
    const legend = document.createElement("div");
    legend.className = "eff-legend";
    legend.innerHTML = usedPhases.map(ph =>
      `<span style="color:${phaseColor(ph.name)}; font-size:10px">● </span>` +
      `<span style="color:${phaseTextColor(ph.name)}; font-size:10px">${ph.name}</span>`
    ).join("&nbsp;&nbsp;");
    container.appendChild(legend);
  }
}

// ─────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────

function getOrCreateTooltip() {
  let tip = d3.select("body").select(".eff-tooltip");
  if (tip.empty()) {
    tip = d3.select("body").append("div").attr("class", "tooltip eff-tooltip");
  }
  return tip.style("display", "none");
}

function buildMonthTicks(weekly, ws, we, xScale) {
  const ticks    = [];
  let lastMonth  = null;
  let monthCount = 0;
  let lastPx     = -100;

  for (let i = ws; i <= we; i++) {
    const w = weekly[i];
    if (!w?.week) continue;
    const dateStr = w.week.includes("/") ? w.week.split("/")[0] : w.week;
    const d = new Date(dateStr + "T00:00:00");
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    if (key === lastMonth) continue;
    lastMonth = key;
    monthCount++;
    if (monthCount % 2 !== 0) continue;

    const px = xScale(i);
    if (px - lastPx < 4) continue;
    lastPx = px;

    ticks.push({
      px,
      label: d.toLocaleDateString("en-US", { month: "short", year: "2-digit" }),
    });
  }
  return ticks;
}
