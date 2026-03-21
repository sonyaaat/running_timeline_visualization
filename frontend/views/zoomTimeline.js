import APP_STATE from "../js/state.js";
import { phaseColor, phaseTextColor } from "../js/colors.js";
import { formatWeekLabel, formatPace, formatKm, showTooltip, hideTooltip } from "../js/utils.js";
import { renderHeatmap } from "./heatmap.js";
import { renderEfficiency } from "./efficiency.js";

const STRIP_H      = 52;
const CHART_H      = 165;
const WEEK_LABEL_H = 56;
const MARGIN       = { top: 16, right: 64, bottom: 10, left: 44 };

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

  document.getElementById("section-detail").style.display      = "block";
  document.getElementById("heatmap-section").style.display     = "none";
  document.getElementById("eff-label").style.display           = "none";
  document.getElementById("bp-section-label").style.display    = "none";
  document.getElementById("breakpoints-container").style.display = "none";

  console.log("[zoom] Rendering weeks", weekStart, "→", weekEnd, "(", nWeeks, "weeks)");
  console.log("[zoom] Phases:", phasesInRange.map(p => p.name));
  console.log("[zoom] Breakpoints in range:", bpInRange.length);

  // ── Step 2: Render timeline ──
  renderTimeline(weekStart, weekEnd, phasesInRange, bpInRange);

  // ── Render supporting views ──
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

  const { phases, weekly } = APP_STATE;
  const nWeeks    = weekEnd - weekStart + 1;
  const visWeekly = weekly.slice(weekStart, weekEnd + 1);

  const W      = container.clientWidth || window.innerWidth;
  const innerW = W - MARGIN.left - MARGIN.right;
  const totalH = MARGIN.top + STRIP_H + CHART_H + WEEK_LABEL_H + MARGIN.bottom;

  const svg = d3.select(container)
    .append("svg")
    .attr("width", W)
    .attr("height", totalH);

  // ── Defs ──
  const defs = svg.append("defs");
  const pat = defs.append("pattern")
    .attr("id", "zt-inactive-stripe")
    .attr("patternUnits", "userSpaceOnUse")
    .attr("width", 6).attr("height", 6);
  pat.append("rect").attr("width", 6).attr("height", 6).attr("fill", "#E9EAEC");
  pat.append("path")
    .attr("d", "M-1,1 l2,-2 M0,6 l6,-6 M5,7 l2,-2")
    .attr("stroke", "#D1D5DB").attr("stroke-width", 1);

  const root = svg.append("g")
    .attr("transform", `translate(${MARGIN.left},${MARGIN.top})`);

  // x scale: absolute week index → pixel
  const x = d3.scaleLinear()
    .domain([weekStart, weekEnd + 1])
    .range([0, innerW]);

  const barStep = innerW / nWeeks;
  const barW    = Math.max(1, barStep - 1.5);
  const tooltip = getOrCreateTooltip();

  // ── Pre-compute month boundaries ──
  const monthBoundaries = [];
  let lastMonthKey = null;
  visWeekly.forEach((w, i) => {
    if (!w.week) return;
    const dateStr = w.week.includes("/") ? w.week.split("/")[0] : w.week;
    const d = new Date(dateStr + "T00:00:00");
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    if (key !== lastMonthKey) {
      monthBoundaries.push({ i, date: d, month: d.getMonth(), year: d.getFullYear() });
      lastMonthKey = key;
    }
  });

  // ─────────────────────────────────────────
  // ROW 1 — Phase strip (thick, with labels + stats)
  // ─────────────────────────────────────────
  const stripG = root.append("g").attr("class", "zt-strip");

  stripG.append("rect")
    .attr("width", innerW).attr("height", STRIP_H)
    .attr("fill", "#F3F4F6").attr("rx", 3);

  // Month boundary lines through strip (drawn first, behind segments)
  monthBoundaries.forEach(mb => {
    if (mb.i === 0) return; // skip left edge
    const px = mb.i * barStep;
    stripG.append("line")
      .attr("x1", px).attr("x2", px)
      .attr("y1", 0).attr("y2", STRIP_H)
      .attr("stroke", "white").attr("stroke-width", 0.8).attr("stroke-opacity", 0.4)
      .style("pointer-events", "none");
  });

  const activeInRange   = phasesInRange.filter(p => p.type === "Active");
  const inactiveInRange = phasesInRange.filter(p => p.type === "Inactive");

  const TREND_SYMBOLS = { building: "↑", stable: "→", tapering: "↓" };
  const TREND_COLORS  = { building: "#3B6D11", stable: "#6B7280", tapering: "#993C1D" };

  function drawStripSeg(phase) {
    const px1 = x(Math.max(phase.week_start, weekStart));
    const px2 = x(Math.min(phase.week_end + 1, weekEnd + 1));
    const bw  = Math.max(1, px2 - px1);
    const isInactive = phase.type === "Inactive";
    const sel = APP_STATE.selectedPhaseId;
    const opacity = sel == null ? 1 : (phase.id === sel ? 1 : 0.3);

    const segG = stripG.append("g");

    // Background
    segG.append("rect")
      .attr("x", px1).attr("y", 0)
      .attr("width", bw).attr("height", STRIP_H)
      .attr("fill", isInactive ? "url(#zt-inactive-stripe)" : phaseColor(phase.name))
      .attr("opacity", opacity)
      .style("cursor", isInactive ? "default" : "pointer")
      .on("mouseover", (event) => {
        const weeks = phase.week_end - phase.week_start + 1;
        if (isInactive) {
          showTooltip(tooltip, event, `<b style="color:#6B7280">Rest period</b> · ${weeks} weeks`);
        } else {
          const s = phase.stats || {};
          showTooltip(tooltip, event,
            `<b style="color:${phaseTextColor(phase.name)}">${phase.name}</b><br>
             ${weeks}w · ${s.km_per_week?.toFixed(1) ?? "—"} km/wk · ${formatPace(s.avg_pace)}`);
        }
      })
      .on("mousemove", (event) => {
        tooltip.style("left", (event.pageX + 12) + "px")
               .style("top",  (event.pageY - 28) + "px");
      })
      .on("mouseout", () => hideTooltip(tooltip))
      .on("click", () => { if (!isInactive) handlePhaseClick(phase, weekStart, weekEnd); });

    // Selected outline
    if (sel === phase.id && !isInactive) {
      segG.append("rect")
        .attr("x", px1).attr("y", 0)
        .attr("width", bw).attr("height", STRIP_H)
        .attr("fill", "none").attr("stroke", "white").attr("stroke-width", 2)
        .style("pointer-events", "none");
    }

    const tc = isInactive ? "#9CA3AF" : phaseTextColor(phase.name);
    const cx = px1 + bw / 2;

    if (!isInactive && bw >= 44) {
      // Phase name
      const nameLabel = bw >= 90 ? phase.name : phase.name.split(/[\s/]/)[0];
      segG.append("text")
        .attr("x", cx).attr("y", STRIP_H / 2 - 8)
        .attr("text-anchor", "middle").attr("dominant-baseline", "middle")
        .style("font-size", bw >= 110 ? "11px" : "10px").style("font-weight", "600")
        .style("pointer-events", "none")
        .attr("fill", tc).attr("opacity", opacity)
        .text(nameLabel);

      // Subtitle: duration + avg km/wk
      if (bw >= 80 && phase.stats) {
        const s = phase.stats;
        segG.append("text")
          .attr("x", cx).attr("y", STRIP_H / 2 + 8)
          .attr("text-anchor", "middle").attr("dominant-baseline", "middle")
          .style("font-size", "9px").style("pointer-events", "none")
          .attr("fill", tc).attr("opacity", opacity * 0.72)
          .text(`${phase.duration_weeks}w · ${s.km_per_week?.toFixed(0) ?? "?"} km/wk`);
      }

      // Trend symbol — top right corner
      if (bw >= 56 && phase.trend && TREND_SYMBOLS[phase.trend]) {
        segG.append("text")
          .attr("x", px2 - 7).attr("y", 11)
          .attr("text-anchor", "end")
          .style("font-size", "11px").style("font-weight", "700")
          .style("pointer-events", "none")
          .attr("fill", TREND_COLORS[phase.trend] ?? "#6B7280")
          .attr("opacity", opacity)
          .text(TREND_SYMBOLS[phase.trend]);
      }
    } else if (isInactive && bw >= 18) {
      segG.append("text")
        .attr("x", cx).attr("y", STRIP_H / 2)
        .attr("text-anchor", "middle").attr("dominant-baseline", "middle")
        .style("font-size", "10px").style("pointer-events", "none")
        .attr("fill", "#9CA3AF").attr("opacity", opacity)
        .text("–");
    }

    // Separator
    if (bw > 1) {
      segG.append("line")
        .attr("x1", px2).attr("x2", px2)
        .attr("y1", 0).attr("y2", STRIP_H)
        .attr("stroke", "white").attr("stroke-width", 1.5)
        .style("pointer-events", "none");
    }
  }

  activeInRange.forEach(drawStripSeg);
  inactiveInRange.forEach(drawStripSeg);

  // ─────────────────────────────────────────
  // ROW 2 — Bar chart with pace overlay
  // ─────────────────────────────────────────
  const chartG = root.append("g")
    .attr("class", "zt-chart")
    .attr("transform", `translate(0,${STRIP_H})`);

  const maxKm = d3.max(visWeekly, w => w.km_total ?? 0) || 1;

  // Km scale
  const kmScale = d3.scaleLinear()
    .domain([0, maxKm * 1.1])
    .range([CHART_H, 0]);

  // Pace scale: low value (fast) → top, high value (slow) → bottom
  const paceWeeks = visWeekly.filter(w => (w.avg_pace ?? 0) > 0);
  const paceMin   = d3.min(paceWeeks, w => w.avg_pace) || 5;
  const paceMax   = d3.max(paceWeeks, w => w.avg_pace) || 7;
  const pacePad   = (paceMax - paceMin) * 0.18 || 0.2;
  const paceScale = d3.scaleLinear()
    .domain([paceMin - pacePad, paceMax + pacePad])
    .range([0, CHART_H]);  // fast = top (y=0), slow = bottom (y=CHART_H)

  // ── Month boundary vertical guidelines through chart ──
  monthBoundaries.forEach(mb => {
    if (mb.i === 0) return;
    const px = mb.i * barStep;
    chartG.append("line")
      .attr("x1", px).attr("x2", px)
      .attr("y1", 0).attr("y2", CHART_H)
      .attr("stroke", mb.month === 0 ? "#C8CAD0" : "#E2E4E8")
      .attr("stroke-width", mb.month === 0 ? 1 : 0.8)
      .attr("stroke-dasharray", "3 3")
      .style("pointer-events", "none");
  });

  // ── Horizontal grid lines ──
  const gridVals = [0.25, 0.5, 0.75, 1.0].map(t => maxKm * t);
  gridVals.forEach(v => {
    chartG.append("line")
      .attr("x1", 0).attr("x2", innerW)
      .attr("y1", kmScale(v)).attr("y2", kmScale(v))
      .attr("stroke", "#EBEBEB").attr("stroke-width", 0.7)
      .style("pointer-events", "none");
  });

  // ── Left Y-axis (km/wk) ──
  [0, Math.round(maxKm / 2), Math.round(maxKm)].forEach(v => {
    chartG.append("text")
      .attr("x", -8).attr("y", kmScale(v))
      .attr("text-anchor", "end").attr("dominant-baseline", "middle")
      .style("font-size", "9px").style("fill", "#9CA3AF")
      .text(v === 0 ? "0" : `${v}`);
  });
  chartG.append("text")
    .attr("x", -8).attr("y", -8)
    .attr("text-anchor", "end")
    .style("font-size", "9px").style("fill", "#9CA3AF")
    .text("km/wk");

  const sel = APP_STATE.selectedPhaseId;

  // ── Bars + run-count dots ──
  const barG = chartG.append("g").attr("class", "zt-bars");

  visWeekly.forEach((w, i) => {
    const km      = w.km_total ?? 0;
    const isEmpty = km === 0;
    const bx      = i * barStep;
    const by      = kmScale(km);
    const bh      = Math.max(isEmpty ? 2 : 3, CHART_H - by);
    const ph      = phases.find(p => p.id === w.phase_id);

    let barOpacity = 1;
    if (sel != null) barOpacity = (ph && ph.id === sel) ? 1.0 : 0.18;

    barG.append("path")
      .attr("d", topRoundedRect(bx, by, barW, bh, isEmpty ? 0 : 2))
      .attr("fill", isEmpty ? "#E5E7EB" : (ph ? phaseColor(ph.name) : "#E5E7EB"))
      .attr("opacity", barOpacity)
      .style("cursor", ph && ph.type === "Active" ? "pointer" : "default")
      .on("mouseover", (event) => {
        if (!ph) return;
        if (ph.type === "Inactive") {
          showTooltip(tooltip, event, `<b style="color:#6B7280">Rest period</b>`);
          return;
        }
        showTooltip(tooltip, event, `
          <div style="font-weight:600;color:${phaseTextColor(ph.name)};margin-bottom:5px">${ph.name}</div>
          <div style="display:flex;flex-direction:column;gap:3px;font-size:12px">
            <span><span style="color:#9CA3AF;width:38px;display:inline-block">km</span>${formatKm(km)}</span>
            <span><span style="color:#9CA3AF;width:38px;display:inline-block">pace</span>${formatPace(w.avg_pace)}</span>
            <span><span style="color:#9CA3AF;width:38px;display:inline-block">runs</span>${w.run_count != null ? Math.round(w.run_count) : "—"}</span>
          </div>
        `);
      })
      .on("mousemove", (event) => {
        tooltip.style("left", (event.pageX + 12) + "px")
               .style("top",  (event.pageY - 28) + "px");
      })
      .on("mouseout", () => hideTooltip(tooltip))
      .on("click", () => { if (ph && ph.type === "Active") handlePhaseClick(ph, weekStart, weekEnd); });

    // Run-count dot above bar
    if (!isEmpty && w.run_count > 0) {
      const r = Math.min(4.5, 1.8 + w.run_count * 0.65);
      barG.append("circle")
        .attr("cx", bx + barW / 2).attr("cy", by - r - 2)
        .attr("r", r)
        .attr("fill", ph ? phaseColor(ph.name) : "#9CA3AF")
        .attr("opacity", barOpacity * 0.55)
        .style("pointer-events", "none");
    }
  });

  // ── Pace line (right axis) ──
  if (paceWeeks.length >= 2) {
    // Split into contiguous segments (skip zero/null weeks)
    const paceData = visWeekly
      .map((w, i) => ({ i, pace: w.avg_pace }))
      .filter(d => d.pace > 0);

    const paceSegments = [];
    let curSeg = [];
    paceData.forEach(d => {
      if (!curSeg.length) { curSeg.push(d); return; }
      const prev = curSeg[curSeg.length - 1];
      if (d.i - prev.i <= 2) { curSeg.push(d); }
      else { paceSegments.push(curSeg); curSeg = [d]; }
    });
    if (curSeg.length) paceSegments.push(curSeg);

    const paceLine = d3.line()
      .x(d => d.i * barStep + barW / 2)
      .y(d => paceScale(d.pace))
      .curve(d3.curveMonotoneX);

    paceSegments.forEach(seg => {
      if (seg.length < 2) return;
      chartG.append("path")
        .datum(seg)
        .attr("fill", "none")
        .attr("stroke", "#D97741")
        .attr("stroke-width", 1.5)
        .attr("opacity", 0.75)
        .attr("d", paceLine)
        .style("pointer-events", "none");
    });

    // Pace dots
    paceData.forEach(d => {
      chartG.append("circle")
        .attr("cx", d.i * barStep + barW / 2)
        .attr("cy", paceScale(d.pace))
        .attr("r", 2.5)
        .attr("fill", "#D97741").attr("stroke", "white").attr("stroke-width", 1)
        .attr("opacity", 0.85)
        .style("pointer-events", "none");
    });

    // Right Y-axis (pace) — top = fast, bottom = slow
    const paceAxisX = innerW + 8;
    [paceMin, (paceMin + paceMax) / 2, paceMax].forEach(v => {
      chartG.append("text")
        .attr("x", paceAxisX).attr("y", paceScale(v))
        .attr("dominant-baseline", "middle")
        .style("font-size", "9px").style("fill", "#D97741").style("opacity", "0.75")
        .text(formatPace(v).replace(" /km", ""));
    });
    chartG.append("text")
      .attr("x", paceAxisX).attr("y", -8)
      .style("font-size", "9px").style("fill", "#D97741").style("opacity", "0.75")
      .text("pace");

    // "faster ↑" annotation at top of pace axis
    chartG.append("text")
      .attr("x", paceAxisX).attr("y", 8)
      .style("font-size", "8px").style("fill", "#D97741").style("opacity", "0.5")
      .text("faster ↑");
  }

  // ── Bottom border ──
  chartG.append("line")
    .attr("x1", 0).attr("x2", innerW)
    .attr("y1", CHART_H).attr("y2", CHART_H)
    .attr("stroke", "#E5E7EB").attr("stroke-width", 1);

  // ── Breakpoint triangles (click to reveal Phase Transitions panel) ──
  const R = 11; // half-size of diamond

  bpInRange.forEach(bp => {
    const fromPhase = phases.find(p => p.id === bp.from_id);
    const toPhase   = phases.find(p => p.id === bp.to_id);
    if (!fromPhase || !toPhase) return;

    const bpX  = x(bp.week_index);
    const col  = phaseColor(toPhase.name);

    const diamondG = chartG.append("g")
      .attr("transform", `translate(${bpX}, ${R + 2})`)
      .style("cursor", "pointer");

    // Invisible hit area (larger than visual for easier clicking)
    diamondG.append("rect")
      .attr("x", -R - 6).attr("y", -R - 6)
      .attr("width", (R + 6) * 2).attr("height", (R + 6) * 2)
      .attr("fill", "transparent");

    // Diamond shape
    const shape = diamondG.append("path")
      .attr("d", `M0,-${R} L${R},0 L0,${R} L-${R},0 Z`)
      .attr("fill", col)
      .attr("fill-opacity", 0.18)
      .attr("stroke", col)
      .attr("stroke-width", 2);

    // "↓" hint inside
    diamondG.append("text")
      .attr("x", 0).attr("y", 1)
      .attr("text-anchor", "middle").attr("dominant-baseline", "middle")
      .style("font-size", "10px").style("font-weight", "700")
      .style("pointer-events", "none")
      .attr("fill", col)
      .text("↓");

    diamondG
      .on("mouseover", (event) => {
        shape.attr("fill-opacity", 0.42);
        showTooltip(tooltip, event,
          `<b>${fromPhase.name}</b> → <b>${toPhase.name}</b><br>
           <span style="color:#9CA3AF;font-size:11px">Click to see transition details</span>`);
      })
      .on("mousemove", (event) => {
        tooltip.style("left", (event.pageX + 12) + "px")
               .style("top",  (event.pageY - 28) + "px");
      })
      .on("mouseout", () => {
        shape.attr("fill-opacity", 0.18);
        hideTooltip(tooltip);
      })
      .on("click", () => {
        showTransitionDetail(bp, fromPhase, toPhase);
      });
  });

  // ─────────────────────────────────────────
  // ROW 3 — Time axis: day ticks + month bands
  // ─────────────────────────────────────────
  const axisG = root.append("g")
    .attr("transform", `translate(0,${STRIP_H + CHART_H})`);

  const multiYear = new Set(monthBoundaries.map(mb => mb.year)).size > 1;
  const DAY_H  = 22;   // day-numbers row height
  const BAND_H = 24;   // month band height

  // Axis baseline
  axisG.append("line")
    .attr("x1", 0).attr("x2", innerW)
    .attr("y1", 0).attr("y2", 0)
    .attr("stroke", "#C8CAD0").attr("stroke-width", 1);

  // ── Month bands (drawn first so day labels sit on top) ──
  const bandY = DAY_H + 2;

  monthBoundaries.forEach((mb, idx) => {
    const px1    = mb.i * barStep;
    const px2    = idx + 1 < monthBoundaries.length
      ? monthBoundaries[idx + 1].i * barStep
      : innerW;
    const spanPx = px2 - px1;
    if (spanPx < 2) return;

    // Alternating background — clear visual separation between months
    axisG.append("rect")
      .attr("x", px1).attr("y", bandY)
      .attr("width", spanPx).attr("height", BAND_H)
      .attr("fill", idx % 2 === 0 ? "#ECEEF1" : "#E2E4E8");

    // Left border at each month boundary
    if (mb.i > 0) {
      axisG.append("line")
        .attr("x1", px1).attr("x2", px1)
        .attr("y1", bandY).attr("y2", bandY + BAND_H)
        .attr("stroke", "#B8BCC4").attr("stroke-width", 1);
    }

    if (spanPx < 28) return;

    // Month name — full if space allows, short otherwise; include year when needed
    const fullName  = mb.date.toLocaleDateString("en-US", { month: "long" });
    const shortName = mb.date.toLocaleDateString("en-US", { month: "short" });
    const yr        = mb.date.getFullYear();
    const needYear  = multiYear || mb.month === 0 || idx === 0;

    let label;
    if (needYear) {
      label = spanPx >= 140 ? `${fullName} ${yr}`
            : spanPx >= 72  ? `${shortName} ${yr}`
            : spanPx >= 36  ? shortName
            : "";
    } else {
      label = spanPx >= 100 ? fullName
            : spanPx >= 36  ? shortName
            : "";
    }

    if (!label) return;

    axisG.append("text")
      .attr("x", px1 + spanPx / 2).attr("y", bandY + BAND_H / 2)
      .attr("text-anchor", "middle").attr("dominant-baseline", "middle")
      .style("font-size", spanPx >= 100 ? "12px" : "11px")
      .style("font-weight", "700")
      .style("fill", "#374151")
      .text(label);
  });

  // ── Day ticks + numbers (row 1) ──
  // Density: every week if barStep≥16, every 2nd if ≥8, every 4th if ≥4, none if <4
  const dayEvery = barStep >= 16 ? 1 : barStep >= 8 ? 2 : barStep >= 4 ? 4 : 0;

  visWeekly.forEach((w, i) => {
    if (!w.week) return;
    const dateStr  = w.week.includes("/") ? w.week.split("/")[0] : w.week;
    const d        = new Date(dateStr + "T00:00:00");
    const px       = i * barStep + barW / 2;
    const isMonthB = monthBoundaries.some(mb => mb.i === i);

    // Tick mark
    axisG.append("line")
      .attr("x1", px).attr("x2", px)
      .attr("y1", 0).attr("y2", isMonthB ? 8 : 4)
      .attr("stroke", isMonthB ? "#9CA3AF" : "#D1D5DB")
      .attr("stroke-width", isMonthB ? 1 : 0.6);

    // Day number
    if (dayEvery > 0 && i % dayEvery === 0) {
      axisG.append("text")
        .attr("x", px).attr("y", DAY_H / 2 + 2)
        .attr("text-anchor", "middle").attr("dominant-baseline", "middle")
        .style("font-size", "11px")
        .style("fill", isMonthB ? "#111827" : "#6B7280")
        .style("font-weight", isMonthB ? "700" : "400")
        .text(d.getDate());
    }
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
// Transition detail panel (single card, shown on diamond click)
// ─────────────────────────────────────────────────────────
function showTransitionDetail(bp, fromPhase, toPhase) {
  const panel     = document.getElementById("bp-detail-panel");
  const { meta }  = APP_STATE;
  const fromColor = phaseColor(fromPhase.name);
  const toColor   = phaseColor(toPhase.name);
  const fromTC    = phaseTextColor(fromPhase.name);
  const toTC      = phaseTextColor(toPhase.name);
  const fs = fromPhase.stats || {};
  const ts = toPhase.stats   || {};
  const ch = bp.changes      || {};

  const metricRows = [
    {
      label: "km / week",
      from:  fs.km_per_week  != null ? `${fs.km_per_week.toFixed(1)} km`  : "—",
      to:    ts.km_per_week  != null ? `${ts.km_per_week.toFixed(1)} km`  : "—",
      pct:   ch.km_per_week,
      bigger: true,
    },
    {
      label: "runs / week",
      from:  fs.runs_per_week != null ? `${fs.runs_per_week.toFixed(1)}`  : "—",
      to:    ts.runs_per_week != null ? `${ts.runs_per_week.toFixed(1)}`  : "—",
      pct:   ch.runs_per_week,
      bigger: true,
    },
    {
      label: "avg pace",
      from:  formatPace(fs.avg_pace),
      to:    formatPace(ts.avg_pace),
      pct:   ch.avg_pace,
      bigger: false,   // lower pace = faster = better
    },
    {
      label: "avg run km",
      from:  fs.avg_run_km != null ? `${fs.avg_run_km.toFixed(1)} km` : "—",
      to:    ts.avg_run_km != null ? `${ts.avg_run_km.toFixed(1)} km` : "—",
      pct:   ch.avg_run_km,
      bigger: true,
      skip:  ch.avg_run_km == null || Math.abs(ch.avg_run_km) < 5,
    },
    {
      label: "efficiency",
      from:  fs.efficiency != null ? fs.efficiency.toFixed(4) : "—",
      to:    ts.efficiency != null ? ts.efficiency.toFixed(4) : "—",
      pct:   ch.efficiency,
      bigger: true,
      skip:  !meta?.has_hr || ch.efficiency == null,
    },
  ];

  const rows = metricRows
    .filter(m => !m.skip && m.pct != null)
    .map(m => {
      const isGood  = m.bigger ? m.pct > 0 : m.pct < 0;
      const isFlat  = Math.abs(m.pct) < 1;
      const pctColor = isFlat ? "#9CA3AF" : isGood ? "#3B6D11" : "#993C1D";
      const sign     = m.pct > 0 ? "+" : "";
      return `
        <tr>
          <td class="bpd-label">${m.label}</td>
          <td class="bpd-val-from">${m.from}</td>
          <td class="bpd-sep">→</td>
          <td class="bpd-val-to">${m.to}</td>
          <td class="bpd-pct" style="color:${pctColor}">${sign}${Math.round(m.pct)}%</td>
        </tr>`;
    }).join("");

  panel.innerHTML = `
    <div class="bpd-header">
      <div class="bpd-phases">
        <span class="bpd-phase-pill" style="color:${fromTC};background:${fromColor}22">${fromPhase.name}</span>
        <span class="bpd-arrow-big">→</span>
        <span class="bpd-phase-pill" style="color:${toTC};background:${toColor}22">${toPhase.name}</span>
      </div>
      <div class="bpd-meta">
        <span class="bpd-date">${bp.date || ""}</span>
        <button class="bpd-close" onclick="document.getElementById('bp-detail-panel').style.display='none'">×</button>
      </div>
    </div>
    <table class="bpd-table">${rows}</table>
  `;

  panel.style.display = "block";
  setTimeout(() => panel.scrollIntoView({ behavior: "smooth", block: "nearest" }), 80);
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
