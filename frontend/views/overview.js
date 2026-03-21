import APP_STATE from "../js/state.js";
import { phaseColor, phaseTextColor, VOLUME_SCALE } from "../js/colors.js";
import { formatWeekLabel, showTooltip, hideTooltip } from "../js/utils.js";
import { renderDetail as renderZoomDetail } from "./zoomTimeline.js";

const STRIP_H    = 100;
const STRIP_LEG  = 30;
const CHART_H    = 480;
const AXIS_H     = 40;
const LEGEND_H   = 26;
const MARGIN     = { top: 16, right: 64, bottom: 10, left: 60 };

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
  // ROW 1 — Volume legend bar
  // ─────────────────────────────────────────────────────────
  const legBarG = root.append("g").attr("class", "volume-legend");

  // "Training load:" label
  legBarG.append("text")
    .attr("x", 0).attr("y", STRIP_LEG / 2)
    .attr("dominant-baseline", "middle")
    .style("font-size", "10px").style("fill", "#9CA3AF")
    .text("Training load:");

  // Colored boxes for each volume level + label
  const BOX = 12;
  let lx = 88;
  VOLUME_SCALE.forEach(({ label, bg }) => {
    legBarG.append("rect")
      .attr("x", lx).attr("y", STRIP_LEG / 2 - BOX / 2)
      .attr("width", BOX).attr("height", BOX).attr("rx", 2)
      .attr("fill", bg).attr("stroke", "rgba(0,0,0,0.1)").attr("stroke-width", 0.5);
    legBarG.append("text")
      .attr("x", lx + BOX + 4).attr("y", STRIP_LEG / 2)
      .attr("dominant-baseline", "middle")
      .style("font-size", "10px").style("fill", "#6B7280")
      .text(label);
    lx += BOX + 4 + label.length * 6 + 10;
  });

  // Inactive box
  legBarG.append("rect")
    .attr("x", lx).attr("y", STRIP_LEG / 2 - BOX / 2)
    .attr("width", BOX).attr("height", BOX).attr("rx", 2)
    .attr("fill", "url(#inactive-stripe)").attr("stroke", "rgba(0,0,0,0.1)").attr("stroke-width", 0.5);
  legBarG.append("text")
    .attr("x", lx + BOX + 4).attr("y", STRIP_LEG / 2)
    .attr("dominant-baseline", "middle")
    .style("font-size", "10px").style("fill", "#6B7280")
    .text("Rest");
  lx += BOX + 4 + 30;

  // Character note
  legBarG.append("text")
    .attr("x", lx + 8).attr("y", STRIP_LEG / 2)
    .attr("dominant-baseline", "middle")
    .style("font-size", "10px").style("fill", "#C0C4CC")
    .text("· / Long Runs, / Fast Weeks, / Frequent, / Consistent = training character");

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
            ? `<b style="color:#6B7280">Rest / Inactive</b><br>${weeks} weeks off`
            : `<b style="color:${tc}">${phase.name}</b><br>
               ${weeks} weeks &nbsp;·&nbsp; ${km} km/w avg &nbsp;·&nbsp; ${tot} km total<br>
               avg pace <b>${pac}</b>`;
          showTooltip(tooltip, event, html);
        })
        .on("mousemove", (event) => {
          tooltip.style("left", (event.pageX + 12) + "px").style("top", (event.pageY - 36) + "px");
        })
        .on("mouseout", () => hideTooltip(tooltip))
        .on("click", () => {
          if (isInactive) return;
          renderDetail(phase.week_start, phase.week_end);
        });

      // Labels — adaptive based on available width
      if (bw >= 32 && !isInactive) {
        const tc = phaseTextColor(phase.name);
        const km = s.km_per_week != null ? s.km_per_week.toFixed(0) : null;

        // Parse name into volume word + character modifier
        const parts    = phase.name.split(" / ");
        const volFull  = parts[0];               // "Steady Volume"
        const volShort = volFull.split(" ")[0];  // "Steady"
        const charPart = parts[1] ?? null;        // "Consistent" | null

        // ── Tier 1: very narrow (32–55px) — one word only
        if (bw < 56) {
          stripG.append("text")
            .attr("x", px1 + bw / 2).attr("y", STRIP_H / 2)
            .attr("text-anchor", "middle").attr("dominant-baseline", "middle")
            .style("font-size", "10px").style("font-weight", "700")
            .style("pointer-events", "none")
            .attr("fill", tc).attr("opacity", opacity)
            .text(volShort);

        // ── Tier 2: medium (56–110px) — volume word + character
        } else if (bw < 112) {
          const cy = charPart ? STRIP_H / 2 - 9 : STRIP_H / 2;
          stripG.append("text")
            .attr("x", px1 + bw / 2).attr("y", cy)
            .attr("text-anchor", "middle").attr("dominant-baseline", "middle")
            .style("font-size", "12px").style("font-weight", "700")
            .style("pointer-events", "none")
            .attr("fill", tc).attr("opacity", opacity)
            .text(volShort);
          if (charPart) {
            stripG.append("text")
              .attr("x", px1 + bw / 2).attr("y", cy + 17)
              .attr("text-anchor", "middle").attr("dominant-baseline", "middle")
              .style("font-size", "10px").style("font-weight", "400")
              .style("pointer-events", "none")
              .attr("fill", tc).attr("opacity", opacity * 0.8)
              .text(`/ ${charPart}`);
          }

        // ── Tier 3: wide (≥112px) — full volume + character + stats
        } else {
          const hasStats  = km != null;
          const lineCount = 1 + (charPart ? 1 : 0) + (hasStats ? 1 : 0);
          const lineH     = 17;
          let ly = STRIP_H / 2 - ((lineCount - 1) * lineH) / 2;

          stripG.append("text")
            .attr("x", px1 + bw / 2).attr("y", ly)
            .attr("text-anchor", "middle").attr("dominant-baseline", "middle")
            .style("font-size", "13px").style("font-weight", "700")
            .style("pointer-events", "none")
            .attr("fill", tc).attr("opacity", opacity)
            .text(volFull);
          ly += lineH;

          if (charPart) {
            stripG.append("text")
              .attr("x", px1 + bw / 2).attr("y", ly)
              .attr("text-anchor", "middle").attr("dominant-baseline", "middle")
              .style("font-size", "11px").style("font-weight", "400")
              .style("pointer-events", "none")
              .attr("fill", tc).attr("opacity", opacity * 0.8)
              .text(`/ ${charPart}`);
            ly += lineH;
          }

          if (hasStats) {
            stripG.append("text")
              .attr("x", px1 + bw / 2).attr("y", ly)
              .attr("text-anchor", "middle").attr("dominant-baseline", "middle")
              .style("font-size", "10px").style("font-weight", "400")
              .style("pointer-events", "none")
              .attr("fill", tc).attr("opacity", opacity * 0.6)
              .text(`${km} km/w · ${weeks}w`);
          }
        }
      } else if (bw >= 20 && isInactive) {
        stripG.append("text")
          .attr("x", px1 + bw / 2).attr("y", STRIP_H / 2)
          .attr("text-anchor", "middle").attr("dominant-baseline", "middle")
          .style("font-size", "11px").style("pointer-events", "none")
          .attr("fill", "#9CA3AF").attr("opacity", opacity)
          .text("–");
      }

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
      .attr("stroke", val === 0 ? "rgba(0,0,0,0.12)" : "rgba(0,0,0,0.06)")
      .attr("stroke-width", val === 0 ? 1 : 0.5)
      .attr("stroke-dasharray", val === 0 ? "none" : "3,4");
    // Axis label (left)
    chartG.append("text")
      .attr("x", -8).attr("y", yy)
      .attr("text-anchor", "end").attr("dominant-baseline", "middle")
      .style("font-size", "10px").style("fill", "#9CA3AF")
      .text(val === 0 ? "" : val);
  });

  // Left axis title
  chartG.append("text")
    .attr("transform", `translate(-42,${CHART_H / 2}) rotate(-90)`)
    .attr("text-anchor", "middle")
    .style("font-size", "10px").style("fill", "rgba(99,102,241,0.7)")
    .text("km / week");

  // ── Km area + line ──
  const kmArea = d3.area()
    .x(d => x(d.weekIdx)).y0(CHART_H).y1(d => yKm(d.km))
    .curve(d3.curveMonotoneX);
  const kmLine = d3.line()
    .x(d => x(d.weekIdx)).y(d => yKm(d.km))
    .curve(d3.curveMonotoneX);

  chartG.append("path").datum(smoothKm)
    .attr("fill", "rgba(99,102,241,0.12)").attr("d", kmArea);
  chartG.append("path").datum(smoothKm)
    .attr("fill", "none")
    .attr("stroke", "rgba(99,102,241,0.6)")
    .attr("stroke-width", 1.8)
    .attr("d", kmLine);

  // ── Pace trend ──
  const rawPace = weekly.map((w, i) => ({
    weekIdx: i + 0.5,
    pace: (w.avg_pace != null && w.run_count > 0) ? w.avg_pace : null
  }));
  // 4-week rolling average — stops at any gap (inactive week), never bridges across
  const paceTrend = rawPace.map((d, i, arr) => {
    if (d.pace == null) return { weekIdx: d.weekIdx, pace: null };
    const win = [];
    for (let j = i; j >= Math.max(0, i - 3); j--) {
      if (arr[j].pace == null) break; // stop at gap, don't look further back
      win.push(arr[j]);
    }
    return { weekIdx: d.weekIdx, pace: win.reduce((s, v) => s + v.pace, 0) / win.length };
  });

  const activePaceTrend = paceTrend.filter(d => d.pace != null);
  let yPace = null;
  if (activePaceTrend.length > 1) {
    const [pMin, pMax] = d3.extent(activePaceTrend, d => d.pace);
    const pPad = Math.max((pMax - pMin) * 0.15, 0.15);
    // Inverted: lower pace value = faster = higher on chart
    yPace = d3.scaleLinear()
      .domain([pMax + pPad, pMin - pPad])
      .range([CHART_H - 8, 8]);

    // Right Y-axis: pace ticks
    const paceTicks = yPace.ticks(5);
    paceTicks.forEach(val => {
      chartG.append("text")
        .attr("x", innerW + 6).attr("y", yPace(val))
        .attr("text-anchor", "start").attr("dominant-baseline", "middle")
        .style("font-size", "10px").style("fill", "rgba(249,115,22,0.7)")
        .text(fmtPaceShort(val));
    });

    // Right axis title
    chartG.append("text")
      .attr("transform", `translate(${innerW + 46},${CHART_H / 2}) rotate(90)`)
      .attr("text-anchor", "middle")
      .style("font-size", "10px").style("fill", "rgba(249,115,22,0.7)")
      .text("pace /km");

    // Dashed bridge across gaps (inactive periods) — drawn first, behind solid line
    const gapLine = d3.line()
      .x(d => x(d.weekIdx)).y(d => yPace(d.pace))
      .curve(d3.curveLinear);

    // Find gap segments: pairs of (last active before gap, first active after gap)
    for (let i = 1; i < paceTrend.length; i++) {
      if (paceTrend[i - 1].pace != null && paceTrend[i].pace == null) {
        // start of gap — find end
        let j = i;
        while (j < paceTrend.length && paceTrend[j].pace == null) j++;
        if (j < paceTrend.length) {
          chartG.append("path")
            .datum([paceTrend[i - 1], paceTrend[j]])
            .attr("fill", "none")
            .attr("stroke", "#F97316")
            .attr("stroke-width", 1.2)
            .attr("stroke-dasharray", "3,4")
            .attr("opacity", 0.35)
            .attr("d", gapLine);
        }
      }
    }

    // Solid pace line — breaks at inactive weeks
    const paceLine = d3.line()
      .defined(d => d.pace != null)
      .x(d => x(d.weekIdx)).y(d => yPace(d.pace))
      .curve(d3.curveMonotoneX);

    chartG.append("path").datum(paceTrend)
      .attr("fill", "none")
      .attr("stroke", "#F97316")
      .attr("stroke-width", 2)
      .attr("opacity", 0.8)
      .attr("d", paceLine);

    // Annotate best pace point
    const bestD = activePaceTrend.reduce((a, b) => b.pace < a.pace ? b : a);
    const bestX = x(bestD.weekIdx);
    const bestY = yPace(bestD.pace);
    chartG.append("circle")
      .attr("cx", bestX).attr("cy", bestY).attr("r", 4)
      .attr("fill", "#F97316").attr("stroke", "white").attr("stroke-width", 1.5);
    chartG.append("text")
      .attr("x", Math.min(bestX, innerW - 70)).attr("y", bestY - 10)
      .style("font-size", "10px").style("fill", "#F97316").style("font-weight", "600")
      .text(`best ${fmtPaceShort(bestD.pace)}`);
  }

  // Annotate peak km
  const peakKmD = smoothKm.reduce((a, b) => b.km > a.km ? b : a, smoothKm[0]);
  if (peakKmD) {
    const pkX = x(peakKmD.weekIdx);
    const pkY = yKm(peakKmD.km);
    chartG.append("circle")
      .attr("cx", pkX).attr("cy", pkY).attr("r", 3.5)
      .attr("fill", "rgba(99,102,241,0.8)").attr("stroke", "white").attr("stroke-width", 1.5);
    chartG.append("text")
      .attr("x", Math.min(pkX, innerW - 60)).attr("y", pkY - 10)
      .style("font-size", "10px").style("fill", "rgba(99,102,241,0.9)").style("font-weight", "600")
      .text(`peak ${Math.round(peakKmD.km)} km`);
  }

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
    const html = `<b>${weekLabel}</b><br>
      ${km} km &nbsp;·&nbsp; ${runs} run${runs !== 1 ? "s" : ""}<br>
      avg pace <b>${pac}</b>`;
    showTooltip(tooltip, event, html);
    tooltip.style("left", (event.pageX + 14) + "px").style("top", (event.pageY - 44) + "px");
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

  // km/week
  legendG.append("rect").attr("x", 0).attr("y", 5).attr("width", 14).attr("height", 4)
    .attr("rx", 2).attr("fill", "rgba(99,102,241,0.5)");
  legendG.append("text").attr("x", 20).attr("y", 13)
    .style("font-size", "10px").style("fill", "#6B7280").text("weekly km (area)");

  // pace trend
  legendG.append("rect").attr("x", 120).attr("y", 6).attr("width", 14).attr("height", 2)
    .attr("rx", 1).attr("fill", "#F97316").attr("opacity", 0.8);
  legendG.append("text").attr("x", 140).attr("y", 13)
    .style("font-size", "10px").style("fill", "#6B7280").text("avg pace — lower = faster (right axis)");

  // drag hint
  legendG.append("text").attr("x", innerW).attr("y", 13)
    .style("font-size", "10px").style("fill", "#C0C4CC").style("text-anchor", "end")
    .text("drag to zoom · click to reset");
}

// ─────────────────────────────────────────────────────────
// Public: resetZoom
// ─────────────────────────────────────────────────────────
export function resetZoom() {
  APP_STATE.zoomRange       = null;
  APP_STATE.hasZoom         = false;
  APP_STATE.selectedPhaseId = null;
  document.getElementById("section-detail").style.display  = "none";
  document.getElementById("heatmap-section").style.display = "none";
  document.getElementById("eff-label").style.display       = "none";
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
    const minGap    = isJanuary ? 30 : 22;
    if (px - lastPx < minGap) return;
    lastPx = px;

    const label = isJanuary
      ? d.toLocaleDateString("en-US", { month: "short", year: "numeric" })
      : d.toLocaleDateString("en-US", { month: "short" });

    ticks.push({ px, label, isJanuary });
  });
  return ticks;
}
