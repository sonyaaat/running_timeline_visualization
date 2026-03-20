import APP_STATE from "../js/state.js";
import { phaseColor } from "../js/colors.js";
import { formatKm, formatPace } from "../js/utils.js";

const CELL_SIZE = 13;
const CELL_GAP  = 2;
const DAYS      = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MARGIN    = { top: 8, right: 16, bottom: 16, left: 32 };

export function renderHeatmap(phaseId) {
  const container = document.getElementById("heatmap-chart");
  container.innerHTML = "";

  const { phases, weekly } = APP_STATE;
  const phase = phases.find(p => p.id === phaseId);
  if (!phase) return;

  // Get weekly rows for this phase
  const phaseWeekly = weekly.filter(w => w.phase_id === phaseId);
  if (!phaseWeekly.length) {
    container.innerHTML = '<p class="no-data-msg">No weekly data for this phase.</p>';
    return;
  }

  const nWeeks = phaseWeekly.length;
  const color  = phaseColor(phase.name);

  // Build a grid: rows = weeks, cols = days of week
  // Use km_total per week, distributed visually
  // If we have daily breakdown we'd use it; since we don't, show weekly km as intensity across a row
  const maxKm = d3.max(phaseWeekly, w => w.km_total ?? 0) || 1;

  const cellStep = CELL_SIZE + CELL_GAP;
  const W = MARGIN.left + nWeeks * cellStep + MARGIN.right;
  const H = MARGIN.top + 7 * cellStep + MARGIN.bottom;

  const svg = d3.select(container)
    .append("svg")
    .attr("width", Math.min(W, (container.clientWidth || 912)))
    .attr("height", H);

  const g = svg.append("g")
    .attr("transform", `translate(${MARGIN.left},${MARGIN.top})`);

  // Day labels on Y
  DAYS.forEach((day, di) => {
    g.append("text")
      .attr("x", -4)
      .attr("y", di * cellStep + CELL_SIZE / 2)
      .style("font-size", "8px")
      .style("fill", "#9CA3AF")
      .style("text-anchor", "end")
      .style("dominant-baseline", "middle")
      .text(day);
  });

  // Color scale from white to phase color
  const colorScale = d3.scaleSequential()
    .domain([0, maxKm])
    .interpolator(d3.interpolate("#F3F4F6", color));

  // Tooltip
  let tip = d3.select("body").select(".tooltip");
  if (tip.empty()) {
    tip = d3.select("body").append("div").attr("class", "tooltip");
  }
  tip.style("display", "none");

  // Draw cells: one column per week, 7 rows (Mon-Sun)
  // Since we don't have daily breakdown, shade all 7 cells equally by weekly km
  phaseWeekly.forEach((w, wi) => {
    const km = w.km_total ?? 0;
    const runs = w.runs ?? w.n_runs ?? 0;

    for (let di = 0; di < 7; di++) {
      const cellColor = km > 0 ? colorScale(km) : "#F3F4F6";

      g.append("rect")
        .attr("x", wi * cellStep)
        .attr("y", di * cellStep)
        .attr("width",  CELL_SIZE)
        .attr("height", CELL_SIZE)
        .attr("rx", 2)
        .attr("fill", cellColor)
        .on("mouseover", (event) => {
          tip.style("display", "block")
             .style("left", (event.pageX + 10) + "px")
             .style("top",  (event.pageY - 28) + "px")
             .html(`
               <div class="tooltip-title">${w.week ?? ""}</div>
               <div class="tooltip-row"><span class="tooltip-key">km</span><span>${formatKm(km)}</span></div>
               <div class="tooltip-row"><span class="tooltip-key">pace</span><span>${formatPace(w.avg_pace)}</span></div>
             `);
        })
        .on("mouseout", () => tip.style("display", "none"));
    }

    // Week label every 4 weeks
    if (wi % 4 === 0) {
      const dateStr = w.week ? (w.week.includes("/") ? w.week.split("/")[0] : w.week) : null;
      if (dateStr) {
        const d = new Date(dateStr + "T00:00:00");
        const label = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
        g.append("text")
          .attr("x", wi * cellStep + CELL_SIZE / 2)
          .attr("y", 7 * cellStep + 10)
          .style("font-size", "8px")
          .style("fill", "#9CA3AF")
          .style("text-anchor", "middle")
          .text(label);
      }
    }
  });

  // Legend
  const legendW = 80;
  const legendG = g.append("g")
    .attr("transform", `translate(0,${7 * cellStep + 20})`);

  const defs = svg.append("defs");
  const grad = defs.append("linearGradient").attr("id", "hm-grad");
  grad.append("stop").attr("offset", "0%").attr("stop-color", "#F3F4F6");
  grad.append("stop").attr("offset", "100%").attr("stop-color", color);

  legendG.append("rect")
    .attr("width", legendW).attr("height", 6)
    .attr("rx", 2)
    .attr("fill", "url(#hm-grad)");

  legendG.append("text")
    .attr("x", 0).attr("y", 16)
    .style("font-size", "8px").style("fill", "#9CA3AF")
    .text("0 km");

  legendG.append("text")
    .attr("x", legendW).attr("y", 16)
    .style("font-size", "8px").style("fill", "#9CA3AF")
    .style("text-anchor", "end")
    .text(formatKm(maxKm));
}
