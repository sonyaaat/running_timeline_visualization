import APP_STATE from "../js/state.js";
import { phaseColor } from "../js/colors.js";
import { formatPace, formatWeekLabel } from "../js/utils.js";

const MARGIN = { top: 12, right: 16, bottom: 36, left: 40 };
const HEIGHT  = 120;

export function renderEfficiency() {
  const container = document.getElementById("efficiency-chart");
  container.innerHTML = "";

  const { weekly, phases, zoomRange, meta } = APP_STATE;
  if (!zoomRange) return;

  const { weekStart, weekEnd } = zoomRange;
  const visWeekly = weekly.slice(weekStart, weekEnd + 1);

  // Check if efficiency data exists
  const hasEff = meta.has_hr && visWeekly.some(w => w.efficiency != null && w.efficiency !== 0);

  const effLabel = document.getElementById("eff-label");
  if (!hasEff) {
    effLabel.style.display = "none";
    return;
  }
  effLabel.style.display = "block";

  const W = container.clientWidth || 912;
  const innerW = W - MARGIN.left - MARGIN.right;
  const innerH = HEIGHT;

  const svg = d3.select(container)
    .append("svg")
    .attr("width", W)
    .attr("height", HEIGHT + MARGIN.top + MARGIN.bottom);

  const g = svg.append("g")
    .attr("transform", `translate(${MARGIN.left},${MARGIN.top})`);

  // x scale: week index
  const x = d3.scaleLinear()
    .domain([weekStart, weekEnd])
    .range([0, innerW]);

  // y scale: efficiency (pace / HR proxy)
  const effValues = visWeekly.map(w => w.efficiency).filter(v => v != null);
  const [yMin, yMax] = d3.extent(effValues);
  const yPad = (yMax - yMin) * 0.15 || 0.005;
  const y = d3.scaleLinear()
    .domain([yMin - yPad, yMax + yPad])
    .range([innerH, 0]);

  // Zero line if range crosses 0
  if (yMin < 0 && yMax > 0) {
    g.append("line")
      .attr("class", "eff-zero-line")
      .attr("x1", 0).attr("x2", innerW)
      .attr("y1", y(0)).attr("y2", y(0));
  }

  // Axes
  const xAxis = d3.axisBottom(x)
    .ticks(Math.min(6, weekEnd - weekStart + 1))
    .tickFormat(i => {
      const w = weekly[Math.round(i)];
      return w ? formatWeekLabel(w.week) : "";
    });

  g.append("g")
    .attr("class", "eff-axis")
    .attr("transform", `translate(0,${innerH})`)
    .call(xAxis);

  const yAxis = d3.axisLeft(y)
    .ticks(4)
    .tickFormat(d3.format(".3f"));

  g.append("g")
    .attr("class", "eff-axis")
    .call(yAxis);

  // Y axis label
  g.append("text")
    .attr("transform", "rotate(-90)")
    .attr("x", -innerH / 2)
    .attr("y", -MARGIN.left + 10)
    .style("font-size", "8px")
    .style("fill", "#9CA3AF")
    .style("text-anchor", "middle")
    .text("efficiency");

  // Efficiency line
  const lineData = visWeekly
    .map((w, i) => ({ i: weekStart + i, eff: w.efficiency, w }))
    .filter(d => d.eff != null);

  if (lineData.length > 1) {
    const line = d3.line()
      .x(d => x(d.i))
      .y(d => y(d.eff))
      .curve(d3.curveMonotoneX);

    g.append("path")
      .datum(lineData)
      .attr("fill", "none")
      .attr("stroke", "#9CA3AF")
      .attr("stroke-width", 1)
      .attr("d", line);
  }

  // Dots colored by phase
  const tooltip = d3.select("body").select(".tooltip");

  g.selectAll("circle.eff-dot")
    .data(lineData)
    .join("circle")
    .attr("class", "eff-dot")
    .attr("cx", d => x(d.i))
    .attr("cy", d => y(d.eff))
    .attr("r", 3.5)
    .attr("fill", d => {
      const ph = phases.find(p => p.id === d.w.phase_id);
      return ph ? phaseColor(ph.name) : "#9CA3AF";
    })
    .attr("stroke", "white")
    .attr("stroke-width", 0.8)
    .on("mouseover", (event, d) => {
      const ph = phases.find(p => p.id === d.w.phase_id);
      tooltip.style("display", "block")
        .style("left", (event.pageX + 10) + "px")
        .style("top",  (event.pageY - 28) + "px")
        .html(`
          <div class="tooltip-title">${d.w.week ?? ""}</div>
          <div class="tooltip-row"><span class="tooltip-key">efficiency</span><span>${d.eff.toFixed(4)}</span></div>
          <div class="tooltip-row"><span class="tooltip-key">pace</span><span>${formatPace(d.w.avg_pace)}</span></div>
          ${ph ? `<div class="tooltip-row"><span class="tooltip-key">phase</span><span>${ph.name}</span></div>` : ""}
        `);
    })
    .on("mouseout", () => tooltip.style("display", "none"));

  // Phase color legend
  const usedPhaseIds = [...new Set(lineData.map(d => d.w.phase_id).filter(Boolean))];
  const usedPhases   = usedPhaseIds.map(id => phases.find(p => p.id === id)).filter(Boolean);

  if (usedPhases.length > 0) {
    const legendDiv = document.createElement("div");
    legendDiv.className = "phase-legend";
    usedPhases.forEach(ph => {
      legendDiv.innerHTML += `
        <span class="legend-item">
          <span class="legend-swatch" style="background:${phaseColor(ph.name)}"></span>
          ${ph.name}
        </span>`;
    });
    container.appendChild(legendDiv);
  }
}
