import APP_STATE from "../js/state.js";
import { phaseColor, phaseTextColor } from "../js/colors.js";
import { formatPace, formatKm, formatWeekLabel } from "../js/utils.js";
import { renderHeatmap } from "./heatmap.js";

const MARGIN = { top: 8, right: 16, bottom: 32, left: 16 };
const BAR_H  = 36;
const VOL_H  = 40;  // volume bars height above phase bars
const GAP    = 8;

export function renderZoomTimeline() {
  const container = document.getElementById("zoom-timeline-chart");
  container.innerHTML = "";

  const { zoomRange, phases, weekly, meta } = APP_STATE;
  if (!zoomRange) return;

  const { weekStart, weekEnd } = zoomRange;

  // Filter to visible range
  const visPhases = phases.filter(p =>
    p.week_end >= weekStart && p.week_start <= weekEnd
  );
  const visWeekly = weekly.slice(weekStart, weekEnd + 1);

  const W = container.clientWidth || 912;
  const innerW = W - MARGIN.left - MARGIN.right;
  const totalH = MARGIN.top + VOL_H + GAP + BAR_H + MARGIN.bottom;

  const svg = d3.select(container)
    .append("svg")
    .attr("width", W)
    .attr("height", totalH);

  const g = svg.append("g")
    .attr("transform", `translate(${MARGIN.left},${MARGIN.top})`);

  const nVisible = weekEnd - weekStart + 1;
  const x = d3.scaleLinear()
    .domain([weekStart, weekEnd + 1])
    .range([0, innerW]);

  // ── Volume bars ──
  const maxKm = d3.max(visWeekly, w => w.km_total ?? 0) || 1;
  const yVol = d3.scaleLinear().domain([0, maxKm]).range([VOL_H, 0]);

  const volG = g.append("g").attr("class", "volume-bars");

  volG.selectAll("rect.vol-bar")
    .data(visWeekly)
    .join("rect")
    .attr("class", "vol-bar")
    .attr("x",      (_, i) => x(weekStart + i) + 1)
    .attr("y",      d => yVol(d.km_total ?? 0))
    .attr("width",  d => Math.max(0, x(weekStart + 1) - x(weekStart) - 2))
    .attr("height", d => VOL_H - yVol(d.km_total ?? 0))
    .attr("fill",   d => {
      if (!d.phase_id) return "#E5E7EB";
      const ph = phases.find(p => p.id === d.phase_id);
      return ph ? phaseColor(ph.name) : "#E5E7EB";
    })
    .attr("opacity", 0.5);

  // km/week axis label
  g.append("text")
    .attr("x", innerW)
    .attr("y", 0)
    .style("font-size", "8px")
    .style("fill", "#9CA3AF")
    .style("text-anchor", "end")
    .text(`max ${formatKm(maxKm)}/wk`);

  // ── Phase bars ──
  const phaseY = VOL_H + GAP;
  const phaseG = g.append("g").attr("class", "zoom-phases");

  const tooltip = createTooltip();

  phaseG.selectAll("rect.zoom-phase-rect")
    .data(visPhases)
    .join("rect")
    .attr("class", d =>
      `zoom-phase-rect${d.id === APP_STATE.selectedPhaseId ? " selected" : ""}`)
    .attr("x",      d => x(Math.max(d.week_start, weekStart)))
    .attr("y",      phaseY)
    .attr("width",  d => Math.max(2,
      x(Math.min(d.week_end + 1, weekEnd + 1)) -
      x(Math.max(d.week_start, weekStart))
    ))
    .attr("height", BAR_H)
    .attr("rx", 3)
    .attr("fill",   d => phaseColor(d.name))
    .on("mouseover", (event, d) => {
      showTooltip(tooltip, event, d);
    })
    .on("mousemove", (event) => {
      tooltip.style("left", (event.pageX + 12) + "px")
             .style("top",  (event.pageY - 28) + "px");
    })
    .on("mouseout", () => tooltip.style("display", "none"))
    .on("click", (event, d) => {
      if (d.type === "Inactive") return;
      const prev = APP_STATE.selectedPhaseId;
      APP_STATE.selectedPhaseId = (prev === d.id) ? null : d.id;
      renderZoomTimeline();
      if (APP_STATE.selectedPhaseId) {
        document.getElementById("heatmap-section").style.display = "block";
        document.getElementById("heatmap-phase-name").textContent = d.name;
        renderHeatmap(d.id);
        document.getElementById("heatmap-section")
          .scrollIntoView({ behavior: "smooth", block: "start" });
      } else {
        document.getElementById("heatmap-section").style.display = "none";
      }
    });

  // Phase name labels
  phaseG.selectAll("text.zoom-phase-label")
    .data(visPhases.filter(d => d.type === "Active"))
    .join("text")
    .attr("class", "zoom-phase-label")
    .attr("x", d => {
      const left  = x(Math.max(d.week_start, weekStart));
      const right = x(Math.min(d.week_end + 1, weekEnd + 1));
      return left + (right - left) / 2;
    })
    .attr("y", phaseY + BAR_H / 2)
    .style("font-size", "9px")
    .style("font-weight", "500")
    .style("pointer-events", "none")
    .style("dominant-baseline", "middle")
    .style("text-anchor", "middle")
    .attr("fill", d => phaseTextColor(d.name))
    .text(d => {
      const left  = x(Math.max(d.week_start, weekStart));
      const right = x(Math.min(d.week_end + 1, weekEnd + 1));
      const barW  = right - left;
      if (barW < 28) return "";
      const maxChars = Math.floor(barW / 6);
      return d.name.length > maxChars ? d.name.slice(0, maxChars - 1) + "…" : d.name;
    });

  // ── Week axis ──
  const axisG = g.append("g")
    .attr("class", "week-axis")
    .attr("transform", `translate(0,${phaseY + BAR_H})`);

  const monthTicks = buildMonthTicks(weekly, weekStart, weekEnd, x);
  axisG.selectAll("line.tick")
    .data(monthTicks)
    .join("line")
    .attr("x1", d => d.px).attr("x2", d => d.px)
    .attr("y1", 0).attr("y2", 5)
    .attr("stroke", "#D1D5DB");

  axisG.selectAll("text.tick")
    .data(monthTicks)
    .join("text")
    .attr("x", d => d.px)
    .attr("y", 14)
    .style("font-size", "9px")
    .style("fill", "#9CA3AF")
    .style("text-anchor", "middle")
    .text(d => d.label);
}

function createTooltip() {
  let tip = d3.select("body").select(".tooltip");
  if (tip.empty()) {
    tip = d3.select("body").append("div").attr("class", "tooltip");
  }
  return tip.style("display", "none");
}

function showTooltip(tooltip, event, d) {
  const s = d.stats || {};
  const weeks = d.week_end - d.week_start + 1;
  tooltip
    .style("display", "block")
    .style("left", (event.pageX + 12) + "px")
    .style("top",  (event.pageY - 28) + "px")
    .html(`
      <div class="tooltip-title">${d.name}</div>
      <div class="tooltip-row"><span class="tooltip-key">Duration</span><span>${weeks}w</span></div>
      <div class="tooltip-row"><span class="tooltip-key">km/wk</span><span>${s.km_per_week != null ? s.km_per_week.toFixed(1) : "—"}</span></div>
      <div class="tooltip-row"><span class="tooltip-key">runs/wk</span><span>${s.runs_per_week != null ? s.runs_per_week.toFixed(1) : "—"}</span></div>
      <div class="tooltip-row"><span class="tooltip-key">pace</span><span>${formatPace(s.avg_pace)}</span></div>
    `);
}

function buildMonthTicks(weekly, weekStart, weekEnd, x) {
  const ticks = [];
  let lastMonth = null;
  for (let i = weekStart; i <= weekEnd; i++) {
    const w = weekly[i];
    if (!w || !w.week) continue;
    const dateStr = w.week.includes("/") ? w.week.split("/")[0] : w.week;
    const d = new Date(dateStr + "T00:00:00");
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    if (key !== lastMonth) {
      lastMonth = key;
      ticks.push({
        px:    x(i),
        label: d.toLocaleDateString("en-US", { month: "short", year: "2-digit" })
      });
    }
  }
  return ticks;
}
