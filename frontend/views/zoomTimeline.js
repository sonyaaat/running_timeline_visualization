import APP_STATE from "../js/state.js";
import { phaseColor, phaseTextColor } from "../js/colors.js";
import { formatWeekLabel, formatPace, formatKm, showTooltip, hideTooltip } from "../js/utils.js";
import { renderHeatmap } from "./heatmap.js";
import { renderBreakpoints } from "./breakpoints.js";
import { renderEfficiency } from "./efficiency.js";

const STRIP_H      = 28;
const CHART_H      = 90;
const WEEK_LABEL_H = 20;
const MARGIN       = { top: 12, right: 16, bottom: 8, left: 16 };

// ─────────────────────────────────────────────────────────
// Public: renderDetail
// ─────────────────────────────────────────────────────────
export function renderDetail(weekStart, weekEnd) {
  const { phases, weekly, breakpoints, meta } = APP_STATE;
  const nWeeks = weekEnd - weekStart + 1;

  // ── Step 1: DOM setup ──
  const phasesInRange = phases.filter(p =>
    p.week_end >= weekStart && p.week_start <= weekEnd
  );
  const bpInRange = breakpoints.filter(bp =>
    bp.week_index >= weekStart && bp.week_index <= weekEnd
  );

  const wStart = weekly[weekStart];
  const wEnd   = weekly[Math.min(weekEnd - 1, weekly.length - 1)];
  const dateStart = wStart ? formatWeekLabel(wStart.week) : "";
  const dateEnd   = wEnd   ? formatWeekLabel(wEnd.week)   : "";
  document.getElementById("zoom-label").textContent =
    dateStart === dateEnd ? dateStart : `${dateStart} – ${dateEnd}`;

  document.getElementById("section-detail").style.display  = "block";
  document.getElementById("heatmap-section").style.display = "none";
  document.getElementById("eff-label").style.display       = "none";

  console.log("[zoom] Rendering weeks", weekStart, "→", weekEnd, "(", nWeeks, "weeks)");
  console.log("[zoom] Phases:", phasesInRange.map(p => p.name));
  console.log("[zoom] Breakpoints in range:", bpInRange.length);

  // ── Step 2: Render timeline ──
  renderTimeline(weekStart, weekEnd, phasesInRange, bpInRange);

  // ── Render supporting views ──
  renderBreakpoints(weekStart, weekEnd);
  renderEfficiency(weekStart, weekEnd);

  // Scroll after short delay so DOM has rendered
  setTimeout(() => {
    document.getElementById("section-detail")
      .scrollIntoView({ behavior: "smooth", block: "start" });
  }, 100);
}

// ─────────────────────────────────────────────────────────
// Internal: render the SVG timeline
// ─────────────────────────────────────────────────────────
function renderTimeline(weekStart, weekEnd, phasesInRange, bpInRange) {
  const container = document.getElementById("zoom-timeline-chart");
  container.innerHTML = "";

  const { phases, weekly, meta } = APP_STATE;
  const nWeeks = weekEnd - weekStart + 1;
  const visWeekly = weekly.slice(weekStart, weekEnd + 1);

  const W      = container.clientWidth || 912;
  const innerW = W - MARGIN.left - MARGIN.right;
  const totalH = MARGIN.top + STRIP_H + CHART_H + WEEK_LABEL_H + MARGIN.bottom;

  const svg = d3.select(container)
    .append("svg")
    .attr("width", W)
    .attr("height", totalH);

  // ── Defs: stripe pattern for inactive ──
  const defs = svg.append("defs");
  const pat = defs.append("pattern")
    .attr("id", "zt-inactive-stripe")
    .attr("patternUnits", "userSpaceOnUse")
    .attr("width", 6).attr("height", 6);
  pat.append("rect")
    .attr("width", 6).attr("height", 6)
    .attr("fill", "#E5E7EB");
  pat.append("path")
    .attr("d", "M-1,1 l2,-2 M0,6 l6,-6 M5,7 l2,-2")
    .attr("stroke", "#D1D5DB").attr("stroke-width", 1);

  const root = svg.append("g")
    .attr("transform", `translate(${MARGIN.left},${MARGIN.top})`);

  // x scale: week index → pixel
  const x = d3.scaleLinear()
    .domain([weekStart, weekEnd + 1])
    .range([0, innerW]);

  const tooltip = getOrCreateTooltip();

  // ─────────────────────────────────────────
  // ROW 1 — Phase strip
  // ─────────────────────────────────────────
  const stripG = root.append("g").attr("class", "zt-strip");

  stripG.append("rect")
    .attr("width", innerW).attr("height", STRIP_H)
    .attr("fill", "#F3F4F6");

  const activeInRange   = phasesInRange.filter(p => p.type === "Active");
  const inactiveInRange = phasesInRange.filter(p => p.type === "Inactive");

  function drawStripSeg(phase) {
    const px1 = x(Math.max(phase.week_start, weekStart));
    const px2 = x(Math.min(phase.week_end + 1, weekEnd + 1));
    const bw  = Math.max(1, px2 - px1);
    const isInactive = phase.type === "Inactive";
    const sel = APP_STATE.selectedPhaseId;
    const opacity = sel == null ? 1
      : (phase.id === sel ? 1.0 : 0.3);

    stripG.append("rect")
      .attr("x", px1).attr("y", 0)
      .attr("width", bw).attr("height", STRIP_H)
      .attr("fill", isInactive ? "url(#zt-inactive-stripe)" : phaseColor(phase.name))
      .attr("opacity", opacity)
      .attr("class", `zt-strip-seg seg-${phase.id}`)
      .style("cursor", isInactive ? "default" : "pointer")
      .on("mouseover", (event) => {
        const weeks = phase.week_end - phase.week_start + 1;
        if (isInactive) {
          showTooltip(tooltip, event,
            `<b style="color:#6B7280">Inactive period</b> · ${weeks} weeks`);
        } else {
          const s = phase.stats || {};
          const tc = phaseTextColor(phase.name);
          showTooltip(tooltip, event,
            `<b style="color:${tc}">${phase.name}</b> · ${weeks}w · ${s.km_per_week != null ? s.km_per_week.toFixed(1) : "—"} km/w avg`);
        }
      })
      .on("mousemove", (event) => {
        tooltip.style("left", (event.pageX + 12) + "px")
               .style("top",  (event.pageY - 28) + "px");
      })
      .on("mouseout", () => hideTooltip(tooltip))
      .on("click", () => {
        if (isInactive) return;
        handlePhaseClick(phase, weekStart, weekEnd);
      });

    // Selected outline
    if (sel === phase.id && !isInactive) {
      stripG.append("rect")
        .attr("x", px1).attr("y", 0)
        .attr("width", bw).attr("height", STRIP_H)
        .attr("fill", "none")
        .attr("stroke", "white")
        .attr("stroke-width", 1.5)
        .style("pointer-events", "none");
    }

    // Label
    if (bw >= 28) {
      let label;
      if (isInactive)    label = "–";
      else if (bw >= 55) label = phase.name;
      else               label = phase.name.split(/[\s/]/)[0];

      stripG.append("text")
        .attr("x", px1 + bw / 2)
        .attr("y", STRIP_H / 2)
        .attr("text-anchor", "middle")
        .attr("dominant-baseline", "middle")
        .style("font-size", "10px")
        .style("font-weight", "500")
        .style("pointer-events", "none")
        .attr("fill", isInactive ? "#9CA3AF" : phaseTextColor(phase.name))
        .attr("opacity", opacity)
        .text(label);
    }

    // Separator
    if (bw > 1) {
      stripG.append("line")
        .attr("x1", px2).attr("x2", px2)
        .attr("y1", 0).attr("y2", STRIP_H)
        .attr("stroke", "white").attr("stroke-width", 1)
        .style("pointer-events", "none");
    }
  }

  activeInRange.forEach(drawStripSeg);
  inactiveInRange.forEach(drawStripSeg);

  // ─────────────────────────────────────────
  // ROW 2 — Weekly bar chart
  // ─────────────────────────────────────────
  const chartG = root.append("g")
    .attr("class", "zt-chart")
    .attr("transform", `translate(0,${STRIP_H})`);

  const maxKm  = d3.max(visWeekly, w => w.km_total ?? 0) || 1;
  const barStep = innerW / nWeeks;
  const barW    = Math.max(1, barStep - 1);
  const availH  = CHART_H * 0.9;

  // Max km label
  chartG.append("text")
    .attr("x", innerW - 2).attr("y", 9)
    .style("font-size", "9px").style("fill", "#999")
    .style("text-anchor", "end").style("pointer-events", "none")
    .text(`max ${Math.round(maxKm)} km/w`);

  const sel = APP_STATE.selectedPhaseId;

  // Bars
  const barG = chartG.append("g").attr("class", "zt-bars");

  visWeekly.forEach((w, i) => {
    const km      = w.km_total ?? 0;
    const isEmpty = km === 0;
    const bh      = isEmpty ? 3 : Math.max(3, (km / maxKm) * availH);
    const bx      = i * barStep;
    const by      = CHART_H - bh;

    // Find phase for this week
    const ph = phases.find(p => p.id === w.phase_id);

    // Opacity based on selection
    let opacity = 1;
    if (sel != null) {
      opacity = (ph && ph.id === sel) ? 1.0 : 0.2;
    }

    // Height boost for selected phase
    const heightBoost = (sel != null && ph && ph.id === sel) ? 1.05 : 1;
    const finalH = bh * heightBoost;
    const finalY = CHART_H - finalH;

    barG.append("path")
      .attr("d", topRoundedRect(bx, finalY, barW, finalH, isEmpty ? 0 : 2))
      .attr("fill", isEmpty ? "#E5E7EB" : (ph ? phaseColor(ph.name) : "#E5E7EB"))
      .attr("opacity", opacity)
      .style("cursor", ph && ph.type === "Active" ? "pointer" : "default")
      .on("mouseover", (event) => {
        if (!ph) return;
        if (ph.type === "Inactive") {
          const wks = ph.week_end - ph.week_start + 1;
          showTooltip(tooltip, event,
            `<b style="color:#6B7280">Inactive period</b> · ${wks} weeks`);
          return;
        }
        showTooltip(tooltip, event, `
          <div class="tooltip-title" style="color:${phaseTextColor(ph.name)}">${ph.name}</div>
          <div class="tooltip-row"><span class="tooltip-key">km</span><span>${formatKm(km)}</span></div>
          <div class="tooltip-row"><span class="tooltip-key">pace</span><span>${formatPace(w.avg_pace)}</span></div>
          <div class="tooltip-row"><span class="tooltip-key">runs</span><span>${w.run_count != null ? Math.round(w.run_count) : "—"}</span></div>
        `);
      })
      .on("mousemove", (event) => {
        tooltip.style("left", (event.pageX + 12) + "px")
               .style("top",  (event.pageY - 28) + "px");
      })
      .on("mouseout", () => hideTooltip(tooltip))
      .on("click", () => {
        if (!ph || ph.type === "Inactive") return;
        handlePhaseClick(ph, weekStart, weekEnd);
      });
  });

  // Trend line (skip zero weeks)
  const trendData = visWeekly
    .map((w, i) => ({ i, km: w.km_total ?? 0 }))
    .filter(d => d.km > 0);

  if (trendData.length > 1) {
    const trendLine = d3.line()
      .x(d => d.i * barStep + barW / 2)
      .y(d => CHART_H - (d.km / maxKm) * availH)
      .curve(d3.curveMonotoneX);

    // Split into contiguous segments (gap where km=0)
    const segments = [];
    let seg = [];
    visWeekly.forEach((w, i) => {
      if ((w.km_total ?? 0) > 0) {
        seg.push({ i, km: w.km_total });
      } else if (seg.length > 0) {
        segments.push(seg);
        seg = [];
      }
    });
    if (seg.length > 0) segments.push(seg);

    segments.forEach(s => {
      if (s.length < 2) return;
      chartG.append("path")
        .datum(s)
        .attr("fill", "none")
        .attr("stroke", "rgba(0,0,0,0.15)")
        .attr("stroke-width", 1)
        .attr("d", trendLine);
    });
  }

  // Breakpoint diamonds
  bpInRange.forEach(bp => {
    const fromPhase = phases.find(p => p.id === bp.from_id);
    const toPhase   = phases.find(p => p.id === bp.to_id);
    if (!fromPhase || !toPhase) return;

    const bpX = x(bp.week_index);
    const diamondG = chartG.append("g")
      .attr("transform", `translate(${bpX}, 8)`)
      .style("cursor", "pointer");

    diamondG.append("path")
      .attr("d", "M0,-6 L5,0 L0,6 L-5,0 Z")
      .attr("fill", "white")
      .attr("stroke", phaseColor(toPhase.name))
      .attr("stroke-width", 1.5);

    diamondG
      .on("mouseover", (event) => {
        showTooltip(tooltip, event,
          `<b>Phase change</b>: ${fromPhase.name} → ${toPhase.name}`);
      })
      .on("mousemove", (event) => {
        tooltip.style("left", (event.pageX + 12) + "px")
               .style("top",  (event.pageY - 28) + "px");
      })
      .on("mouseout", () => hideTooltip(tooltip))
      .on("click", () => {
        const card = document.getElementById(`bp-card-${bp.from_id}`);
        if (!card) return;
        card.scrollIntoView({ behavior: "smooth", block: "nearest" });
        document.querySelectorAll(".bp-card.highlighted")
          .forEach(c => c.classList.remove("highlighted"));
        card.classList.add("highlighted");
      });
  });

  // Bottom axis line
  chartG.append("line")
    .attr("x1", 0).attr("x2", innerW)
    .attr("y1", CHART_H).attr("y2", CHART_H)
    .attr("stroke", "rgba(0,0,0,0.08)").attr("stroke-width", 1);

  // ─────────────────────────────────────────
  // Week labels (every 4 weeks)
  // ─────────────────────────────────────────
  const labelsG = root.append("g")
    .attr("transform", `translate(0,${STRIP_H + CHART_H})`);

  visWeekly.forEach((w, i) => {
    if (i % 4 !== 0) return;
    if (!w.week) return;
    const dateStr = w.week.includes("/") ? w.week.split("/")[0] : w.week;
    const d = new Date(dateStr + "T00:00:00");
    const label = d.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
    const lx = i * barStep + barW / 2;
    labelsG.append("text")
      .attr("x", lx).attr("y", 13)
      .style("font-size", "9px").style("fill", "#9CA3AF")
      .style("text-anchor", "middle")
      .text(label);
  });
}

// ─────────────────────────────────────────────────────────
// Phase click handler (shared by strip and bar clicks)
// ─────────────────────────────────────────────────────────
function handlePhaseClick(phase, weekStart, weekEnd) {
  const prev = APP_STATE.selectedPhaseId;
  APP_STATE.selectedPhaseId = (prev === phase.id) ? null : phase.id;

  console.log("[zoom] Phase clicked:", phase.name);

  // Re-render the timeline to apply selection styling
  const phasesInRange = APP_STATE.phases.filter(p =>
    p.week_end >= weekStart && p.week_start <= weekEnd
  );
  const bpInRange = APP_STATE.breakpoints.filter(bp =>
    bp.week_index >= weekStart && bp.week_index <= weekEnd
  );
  renderTimeline(weekStart, weekEnd, phasesInRange, bpInRange);

  if (APP_STATE.selectedPhaseId) {
    document.getElementById("heatmap-section").style.display = "block";
    const nameEl = document.getElementById("heatmap-phase-name");
    nameEl.textContent  = phase.name;
    nameEl.style.color  = phaseTextColor(phase.name);
    renderHeatmap(phase.id);
    renderEfficiency(weekStart, weekEnd);
    document.getElementById("heatmap-section")
      .scrollIntoView({ behavior: "smooth", block: "start" });
  } else {
    document.getElementById("heatmap-section").style.display = "none";
  }
}

// ─────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────

function getOrCreateTooltip() {
  let tip = d3.select("body").select(".zt-tooltip");
  if (tip.empty()) {
    tip = d3.select("body").append("div").attr("class", "tooltip zt-tooltip");
  }
  return tip.style("display", "none");
}

// SVG path for a rect with only top corners rounded
function topRoundedRect(x, y, w, h, r) {
  if (h <= 0) return "";
  const rx = Math.min(r, w / 2, h);
  if (rx <= 0) return `M${x},${y}h${w}v${h}h-${w}Z`;
  return [
    `M${x + rx},${y}`,
    `h${w - 2 * rx}`,
    `q${rx},0 ${rx},${rx}`,
    `v${h - rx}`,
    `h-${w}`,
    `v-${h - rx}`,
    `q0,-${rx} ${rx},-${rx}Z`,
  ].join(" ");
}
