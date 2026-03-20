
import APP_STATE from "../js/state.js";
import { phaseColor, phaseTextColor } from "../js/colors.js";
import { formatWeekLabel } from "../js/utils.js";

let resizeObserver = null;
let chartWidth = 900;
let chartHeight = 108; // 28 + 80
let margin = { top: 0, right: 48, bottom: 32, left: 32 };
let tooltipDiv = null;

export function renderOverview() {
  // Remove previous chart if exists
  let old = document.getElementById("overview-section");
  if (old) old.remove();

  const app = document.getElementById("app");
  const section = document.createElement("section");
  section.id = "overview-section";
  section.style.position = "relative";
  app.prepend(section);

  // Responsive width
  let width = app.clientWidth || 900;
  chartWidth = width - margin.left - margin.right;
  chartHeight = 108;

  // Logs
  console.log("[overview] Rendering with", APP_STATE.phases.length, "phases,", APP_STATE.weekly.length, "weeks");
  console.log("[overview] Chart width:", chartWidth, "px");
  console.log("[overview] Efficiency enabled:", APP_STATE.meta.has_hr);

  // SVG root
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("width", width);
  svg.setAttribute("height", chartHeight + 36);
  svg.style.display = "block";
  section.appendChild(svg);

  // PHASE BAND (Row 1)
  const phaseBandHeight = 28;
  let x = margin.left;
  const totalWeeks = APP_STATE.meta.total_weeks || APP_STATE.weekly.length;
  APP_STATE.phases.forEach(phase => {
    const weeks = (phase.week_end - phase.week_start + 1);
    const segWidth = weeks / totalWeeks * chartWidth;
    // Segment rect
    const rect = document.createElementNS(svg.namespaceURI, "rect");
    rect.setAttribute("x", x);
    rect.setAttribute("y", margin.top);
    rect.setAttribute("width", segWidth);
    rect.setAttribute("height", phaseBandHeight);
    rect.setAttribute("fill", phaseColor(phase.name));
    rect.setAttribute("cursor", "pointer");
    rect.setAttribute("data-phase-id", phase.id);
    rect.addEventListener("click", () => selectPhaseBand(phase));
    rect.addEventListener("mousemove", e => showTooltip(e, phase, x, segWidth));
    rect.addEventListener("mouseleave", hideTooltip);
    svg.appendChild(rect);
    // Label
    let label = null;
    if (segWidth > 60) label = phase.name;
    else if (segWidth > 30) label = phase.name.split(" ")[0];
    if (label) {
      const text = document.createElementNS(svg.namespaceURI, "text");
      text.setAttribute("x", x + segWidth / 2);
      text.setAttribute("y", margin.top + phaseBandHeight / 2 + 5);
      text.setAttribute("text-anchor", "middle");
      text.setAttribute("fill", phaseTextColor(phase.name));
      text.setAttribute("font-size", "13px");
      text.setAttribute("pointer-events", "none");
      text.textContent = label;
      svg.appendChild(text);
    }
    x += segWidth;
  });

  // CHART AREA (Row 2)
  const chartY = margin.top + phaseBandHeight;
  const chartH = 80;
  // Background phase color bands (light)
  x = margin.left;
  APP_STATE.phases.forEach(phase => {
    const weeks = (phase.week_end - phase.week_start + 1);
    const segWidth = weeks / totalWeeks * chartWidth;
    const rect = document.createElementNS(svg.namespaceURI, "rect");
    rect.setAttribute("x", x);
    rect.setAttribute("y", chartY);
    rect.setAttribute("width", segWidth);
    rect.setAttribute("height", chartH);
    rect.setAttribute("fill", phaseColor(phase.name));
    rect.setAttribute("fill-opacity", 0.18);
    svg.appendChild(rect);
    x += segWidth;
  });

  // Area/line chart for km_total
  const weeks = APP_STATE.weekly;
  const xScale = d3.scaleLinear()
    .domain([0, totalWeeks - 1])
    .range([margin.left, margin.left + chartWidth]);
  const kmVals = weeks.map(w => w.km_total || 0);
  // 4-week rolling average for smoothness
  const kmSmooth = kmVals.map((v, i, arr) => {
    let sum = 0, n = 0;
    for (let j = Math.max(0, i - 1); j <= Math.min(arr.length - 1, i + 2); ++j) {
      sum += arr[j]; n++;
    }
    return sum / n;
  });
  const kmMax = Math.max(40, d3.max(kmSmooth));
  const yScale = d3.scaleLinear()
    .domain([0, kmMax])
    .range([chartY + chartH, chartY]);

  // Area
  const area = d3.area()
    .x((d, i) => xScale(i))
    .y0(yScale(0))
    .y1((d, i) => yScale(d));
  const areaPath = document.createElementNS(svg.namespaceURI, "path");
  areaPath.setAttribute("d", area(kmSmooth));
  areaPath.setAttribute("fill", "#2563eb");
  areaPath.setAttribute("fill-opacity", 0.18);
  svg.appendChild(areaPath);

  // Line
  const line = d3.line()
    .x((d, i) => xScale(i))
    .y((d, i) => yScale(d));
  const linePath = document.createElementNS(svg.namespaceURI, "path");
  linePath.setAttribute("d", line(kmSmooth));
  linePath.setAttribute("fill", "none");
  linePath.setAttribute("stroke", "#2563eb");
  linePath.setAttribute("stroke-width", 2);
  svg.appendChild(linePath);

  // Efficiency line (if has_hr)
  let effMin = 0, effMax = 1;
  if (APP_STATE.meta.has_hr) {
    const effVals = weeks.map(w => w.efficiency).filter(v => v != null);
    if (effVals.length) {
      effMin = d3.min(effVals);
      effMax = d3.max(effVals);
    }
    const effScale = d3.scaleLinear()
      .domain([effMin, effMax])
      .range([chartY + chartH, chartY]);
    const effLine = d3.line()
      .x((d, i) => xScale(i))
      .y((d, i) => weeks[i].efficiency == null ? null : effScale(weeks[i].efficiency));
    const effPath = document.createElementNS(svg.namespaceURI, "path");
    effPath.setAttribute("d", effLine(weeks));
    effPath.setAttribute("fill", "none");
    effPath.setAttribute("stroke", "#7F77DD");
    effPath.setAttribute("stroke-width", 1);
    effPath.setAttribute("stroke-dasharray", "4 2");
    svg.appendChild(effPath);
  }

  // DRAG INTERACTION
  let dragStartX = null, dragEndX = null, dragging = false;
  let dragOverlay = null, dragBorder = null, dragLabel = null;
  svg.addEventListener("mousedown", e => {
    if (e.y < chartY || e.y > chartY + chartH) return;
    dragging = true;
    dragStartX = e.offsetX;
    dragEndX = e.offsetX;
    if (!dragOverlay) {
      dragOverlay = document.createElementNS(svg.namespaceURI, "rect");
      dragOverlay.setAttribute("y", chartY);
      dragOverlay.setAttribute("height", chartH);
      dragOverlay.setAttribute("fill", "#222");
      dragOverlay.setAttribute("fill-opacity", 0.12);
      svg.appendChild(dragOverlay);
    }
    if (!dragBorder) {
      dragBorder = document.createElementNS(svg.namespaceURI, "rect");
      dragBorder.setAttribute("y", chartY);
      dragBorder.setAttribute("height", chartH);
      dragBorder.setAttribute("fill", "none");
      dragBorder.setAttribute("stroke", "#fff");
      dragBorder.setAttribute("stroke-width", 2);
      svg.appendChild(dragBorder);
    }
    if (!dragLabel) {
      dragLabel = document.createElementNS(svg.namespaceURI, "text");
      dragLabel.setAttribute("y", chartY + 18);
      dragLabel.setAttribute("fill", "#222");
      dragLabel.setAttribute("font-size", "13px");
      dragLabel.setAttribute("font-weight", "bold");
      svg.appendChild(dragLabel);
    }
  });
  svg.addEventListener("mousemove", e => {
    if (!dragging) return;
    dragEndX = Math.max(margin.left, Math.min(margin.left + chartWidth, e.offsetX));
    let x0 = Math.min(dragStartX, dragEndX);
    let x1 = Math.max(dragStartX, dragEndX);
    dragOverlay.setAttribute("x", margin.left);
    dragOverlay.setAttribute("width", chartWidth);
    dragOverlay.setAttribute("fill-opacity", 0.12);
    // Overlay left
    dragOverlay.setAttribute("mask", null);
    // Border
    dragBorder.setAttribute("x", x0);
    dragBorder.setAttribute("width", x1 - x0);
    // Label
    let week0 = Math.round(xScale.invert(x0));
    let week1 = Math.round(xScale.invert(x1));
    let nWeeks = Math.abs(week1 - week0) + 1;
    dragLabel.setAttribute("x", (x0 + x1) / 2);
    dragLabel.textContent = nWeeks + "w";
  });
  svg.addEventListener("mouseup", e => {
    if (!dragging) return;
    dragging = false;
    let dist = Math.abs(dragEndX - dragStartX);
    if (dist < 16) {
      resetZoom();
    } else {
      let x0 = Math.min(dragStartX, dragEndX);
      let x1 = Math.max(dragStartX, dragEndX);
      let weekStart = Math.max(0, Math.round(xScale.invert(x0)));
      let weekEnd = Math.min(totalWeeks - 1, Math.round(xScale.invert(x1)));
      APP_STATE.zoomRange = { weekStart, weekEnd };
      APP_STATE.hasZoom = true;
      APP_STATE.selectedPhaseId = null;
      // Remove overlays
      if (dragOverlay) dragOverlay.remove();
      if (dragBorder) dragBorder.remove();
      if (dragLabel) dragLabel.remove();
      dragOverlay = dragBorder = dragLabel = null;
      // Log
      console.log("[overview] Drag selection: weeks", weekStart, "→", weekEnd, "(", weekEnd - weekStart, "weeks)");
      // Show detail
      import("./zoomTimeline.js").then(m => m.renderZoomTimeline());
    }
  });
  svg.addEventListener("mouseleave", e => {
    if (dragging) {
      dragging = false;
      if (dragOverlay) dragOverlay.remove();
      if (dragBorder) dragBorder.remove();
      if (dragLabel) dragLabel.remove();
      dragOverlay = dragBorder = dragLabel = null;
    }
  });

  // MONTH LABELS
  let labelY = chartY + chartH + 18;
  let lastLabelEnd = -Infinity;
  for (let i = 0; i < weeks.length; i++) {
    let week = weeks[i];
    if (!week.date_start) continue;
    let d = new Date(week.date_start);
    if (d.getDate() > 7) continue; // only first week of month
    if (d.getMonth() % 3 !== 0) continue; // every 3 months
    let label = formatWeekLabel(week.date_start);
    let xPos = xScale(i);
    // Prevent overlap
    if (xPos - lastLabelEnd < 48) continue;
    const text = document.createElementNS(svg.namespaceURI, "text");
    text.setAttribute("x", xPos);
    text.setAttribute("y", labelY);
    text.setAttribute("text-anchor", "middle");
    text.setAttribute("font-size", d.getMonth() === 0 ? "bold 13px" : "12px");
    text.textContent = label;
    svg.appendChild(text);
    lastLabelEnd = xPos + (label.length * 7);
  }

  // LEGEND
  const legend = document.createElementNS(svg.namespaceURI, "g");
  legend.setAttribute("transform", `translate(${margin.left},${labelY + 16})`);
  // km/week box
  const box = document.createElementNS(svg.namespaceURI, "rect");
  box.setAttribute("x", 0);
  box.setAttribute("y", -10);
  box.setAttribute("width", 18);
  box.setAttribute("height", 10);
  box.setAttribute("fill", "#2563eb");
  box.setAttribute("fill-opacity", 0.18);
  legend.appendChild(box);
  // km/week label
  const txt1 = document.createElementNS(svg.namespaceURI, "text");
  txt1.setAttribute("x", 22);
  txt1.setAttribute("y", 0);
  txt1.setAttribute("font-size", "12px");
  txt1.textContent = "km/week";
  legend.appendChild(txt1);
  // efficiency line
  if (APP_STATE.meta.has_hr) {
    const line = document.createElementNS(svg.namespaceURI, "line");
    line.setAttribute("x1", 80);
    line.setAttribute("x2", 100);
    line.setAttribute("y1", -5);
    line.setAttribute("y2", -5);
    line.setAttribute("stroke", "#7F77DD");
    line.setAttribute("stroke-width", 1);
    line.setAttribute("stroke-dasharray", "4 2");
    legend.appendChild(line);
    const txt2 = document.createElementNS(svg.namespaceURI, "text");
    txt2.setAttribute("x", 104);
    txt2.setAttribute("y", 0);
    txt2.setAttribute("font-size", "12px");
    txt2.textContent = "efficiency";
    legend.appendChild(txt2);
  }
  svg.appendChild(legend);

  // TOOLTIP
  if (!tooltipDiv) {
    tooltipDiv = document.createElement("div");
    tooltipDiv.style.position = "absolute";
    tooltipDiv.style.pointerEvents = "none";
    tooltipDiv.style.background = "#fff";
    tooltipDiv.style.border = "1px solid #ccc";
    tooltipDiv.style.borderRadius = "6px";
    tooltipDiv.style.padding = "6px 12px";
    tooltipDiv.style.fontSize = "13px";
    tooltipDiv.style.boxShadow = "0 2px 8px rgba(0,0,0,0.08)";
    tooltipDiv.style.display = "none";
    tooltipDiv.style.zIndex = 10;
    section.appendChild(tooltipDiv);
  }

  // ResizeObserver for responsiveness
  if (resizeObserver) resizeObserver.disconnect();
  resizeObserver = new ResizeObserver(() => {
    renderOverview();
  });
  resizeObserver.observe(app);
}

function showTooltip(e, phase, x, segWidth) {
  if (!tooltipDiv) return;
  tooltipDiv.style.display = "block";
  tooltipDiv.innerHTML = `<b>${phase.name}</b> · ${phase.week_end - phase.week_start + 1}w · ${phase.stats.km_per_week?.toFixed(1) ?? '--'} km/w`;
  let left = e.clientX - 40;
  let top = e.clientY - 48;
  tooltipDiv.style.left = left + "px";
  tooltipDiv.style.top = top + "px";
}
function hideTooltip() {
  if (tooltipDiv) tooltipDiv.style.display = "none";
}

function selectPhaseBand(phase) {
  APP_STATE.zoomRange = { weekStart: phase.week_start, weekEnd: phase.week_end };
  APP_STATE.hasZoom = true;
  APP_STATE.selectedPhaseId = phase.id;
  import("./zoomTimeline.js").then(m => m.renderZoomTimeline());
}

export function resetZoom() {
  APP_STATE.zoomRange = null;
  APP_STATE.hasZoom = false;
  APP_STATE.selectedPhaseId = null;
  const detail = document.getElementById("section-detail");
  if (detail) detail.style.display = "none";
  renderOverview();
}
