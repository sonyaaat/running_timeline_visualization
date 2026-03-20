import APP_STATE from "../js/state.js";
import { phaseColor } from "../js/colors.js";
import { formatWeekLabel } from "../js/utils.js";
import { renderZoomTimeline } from "./zoomTimeline.js";
import { renderBreakpoints } from "./breakpoints.js";
import { renderEfficiency } from "./efficiency.js";

const HEIGHT       = 88;
const BAR_H        = 56;
const MARGIN       = { top: 10, right: 0, bottom: 32, left: 0 };

export function renderOverview() {
  const container = document.getElementById("overview-chart");
  container.innerHTML = "";

  const W = container.clientWidth || window.innerWidth;
  const innerW = W - MARGIN.left - MARGIN.right;

  const phases  = APP_STATE.phases;
  const weekly  = APP_STATE.weekly;
  const nWeeks  = APP_STATE.meta.total_weeks ?? weekly.length;

  const svg = d3.select(container)
    .append("svg")
    .attr("width", W)
    .attr("height", HEIGHT + MARGIN.top + MARGIN.bottom);

  const g = svg.append("g")
    .attr("transform", `translate(${MARGIN.left},${MARGIN.top})`);

  // x scale: week index → pixel
  const x = d3.scaleLinear().domain([0, nWeeks]).range([0, innerW]);

  // Draw phase bars
  const phaseG = g.append("g").attr("class", "phases");

  phaseG.selectAll("rect.phase-bar")
    .data(phases)
    .join("rect")
    .attr("class", "phase-bar")
    .attr("x",      d => x(d.week_start))
    .attr("y",      (HEIGHT - BAR_H) / 2)
    .attr("width",  d => Math.max(1, x(d.week_end + 1) - x(d.week_start)))
    .attr("height", BAR_H)
    .attr("rx", 2)
    .attr("fill",   d => phaseColor(d.name));

  // Phase name labels (only if wide enough)
  phaseG.selectAll("text.phase-label")
    .data(phases.filter(d => d.type === "Active"))
    .join("text")
    .attr("class", "phase-label")
    .attr("x",    d => x(d.week_start) + (x(d.week_end + 1) - x(d.week_start)) / 2)
    .attr("y",    HEIGHT / 2)
    .attr("fill", "#fff")
    .style("font-size", "11px")
    .style("font-weight", "500")
    .style("pointer-events", "none")
    .style("dominant-baseline", "middle")
    .style("text-anchor", "middle")
    .text(d => {
      const barW = x(d.week_end + 1) - x(d.week_start);
      if (barW < 40) return "";
      const label = d.name;
      const maxChars = Math.floor(barW / 7);
      return label.length > maxChars ? label.slice(0, maxChars - 1) + "…" : label;
    });

  // Month axis ticks
  const axisG = g.append("g")
    .attr("class", "week-axis")
    .attr("transform", `translate(0,${HEIGHT})`);

  // Build month tick data from weekly
  const monthTicks = buildMonthTicks(weekly, x);

  axisG.selectAll("line.tick")
    .data(monthTicks)
    .join("line")
    .attr("x1", d => d.px).attr("x2", d => d.px)
    .attr("y1", 0).attr("y2", 5)
    .attr("stroke", "#D1D5DB");

  axisG.selectAll("text.tick")
    .data(monthTicks.filter((_, i) => i % 2 === 0))
    .join("text")
    .attr("x", d => d.px)
    .attr("y", 16)
    .style("font-size", "11px")
    .style("fill", "#9CA3AF")
    .style("text-anchor", "middle")
    .text(d => d.label);

  // Brush for drag-to-zoom
  const brush = d3.brushX()
    .extent([[0, (HEIGHT - BAR_H) / 2 - 2], [innerW, (HEIGHT + BAR_H) / 2 + 2]])
    .on("end", brushed);

  const brushG = g.append("g").attr("class", "brush");
  brushG.call(brush);

  function brushed(event) {
    if (!event.selection) return;
    const [x0, x1] = event.selection;
    const weekStart = Math.max(0, Math.round(x.invert(x0)));
    const weekEnd   = Math.min(nWeeks - 1, Math.round(x.invert(x1)) - 1);
    if (weekEnd <= weekStart) return;

    APP_STATE.zoomRange = { weekStart, weekEnd };
    APP_STATE.hasZoom   = true;
    APP_STATE.selectedPhaseId = null;

    // Update zoom label
    const wStart = weekly[weekStart];
    const wEnd   = weekly[Math.min(weekEnd, weekly.length - 1)];
    const labelStart = wStart ? formatWeekLabel(wStart.week) : "";
    const labelEnd   = wEnd   ? formatWeekLabel(wEnd.week)   : "";
    document.getElementById("zoom-label").textContent =
      labelStart === labelEnd ? labelStart : `${labelStart} – ${labelEnd}`;

    document.getElementById("section-detail").style.display = "block";
    document.getElementById("heatmap-section").style.display = "none";
    document.getElementById("eff-label").style.display = "none";

    renderZoomTimeline();
    renderBreakpoints();
    renderEfficiency();

    // Scroll to detail section
    document.getElementById("section-detail").scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

function buildMonthTicks(weekly, x) {
  const ticks = [];
  let lastMonth = null;
  weekly.forEach((w, i) => {
    const dateStr = w.week ? (w.week.includes("/") ? w.week.split("/")[0] : w.week) : null;
    if (!dateStr) return;
    const d = new Date(dateStr + "T00:00:00");
    const monthKey = `${d.getFullYear()}-${d.getMonth()}`;
    if (monthKey !== lastMonth) {
      lastMonth = monthKey;
      ticks.push({
        px: x(i),
        label: d.toLocaleDateString("en-US", { month: "short", year: "2-digit" })
      });
    }
  });
  return ticks;
}
