import APP_STATE from "../js/state.js";
import { phaseColor, phaseTextColor } from "../js/colors.js";
import { formatWeekLabel, formatPace, showTooltip, hideTooltip } from "../js/utils.js";

import { renderWeekDetail } from "./weekDetail.js";

const STRIP_H      = 72;
const CHART_H      = 260;
const WEEK_LABEL_H = 56;
const MARGIN       = { top: 16, right: 64, bottom: 10, left: 44 };

let _weekDeselectedWeekStart = null;
let _weekDeselectedWeekEnd   = null;
function _onWeekDeselected() {
  if (_weekDeselectedWeekStart == null) return;
  const ws = _weekDeselectedWeekStart;
  const we = _weekDeselectedWeekEnd;
  const phasesInRange = APP_STATE.phases.filter(p => p.week_end >= ws && p.week_start <= we);
  const bpInRange     = APP_STATE.breakpoints.filter(bp => bp.week_index >= ws && bp.week_index <= we);
  renderTimeline(ws, we, phasesInRange, bpInRange);
}

function _onWeekSelected() {
  if (_weekDeselectedWeekStart == null) return;
  const ws = _weekDeselectedWeekStart;
  const we = _weekDeselectedWeekEnd;
  const phasesInRange = APP_STATE.phases.filter(p => p.week_end >= ws && p.week_start <= we);
  const bpInRange     = APP_STATE.breakpoints.filter(bp => bp.week_index >= ws && bp.week_index <= we);
  renderTimeline(ws, we, phasesInRange, bpInRange);
}

// ─────────────────────────────────────────────────────────
// Public: renderDetail
// ─────────────────────────────────────────────────────────
export function renderDetail(weekStart, weekEnd) {
  const { phases, weekly, breakpoints } = APP_STATE;
  const nWeeks = weekEnd - weekStart + 1;
  _weekDeselectedWeekStart = weekStart;
  _weekDeselectedWeekEnd   = weekEnd;

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
  document.getElementById("bp-section-label").style.display    = "none";
  document.getElementById("breakpoints-container").style.display = "none";

  console.log("[zoom] Rendering weeks", weekStart, "→", weekEnd, "(", nWeeks, "weeks)");
  console.log("[zoom] Phases:", phasesInRange.map(p => p.name));
  console.log("[zoom] Breakpoints in range:", bpInRange.length);

  // ── Step 2: Render timeline ──
  if (!APP_STATE.ztLineMetric) APP_STATE.ztLineMetric = "pace";
  renderTimeline(weekStart, weekEnd, phasesInRange, bpInRange);

  // ── Toggle buttons ──
  document.querySelectorAll(".zt-toggle-btn").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.metric === APP_STATE.ztLineMetric);
    btn.onclick = () => {
      APP_STATE.ztLineMetric = btn.dataset.metric;
      document.querySelectorAll(".zt-toggle-btn").forEach(b =>
        b.classList.toggle("active", b === btn)
      );
      renderTimeline(weekStart, weekEnd, phasesInRange, bpInRange);
    };
  });

  // Scroll so the Phase Timeline is centered on screen
  setTimeout(() => {
    document.getElementById("zoom-timeline-chart")
      .scrollIntoView({ behavior: "smooth", block: "center" });
  }, 100);

  // Remove any stale listeners and add fresh ones
  document.removeEventListener("week-deselected", _onWeekDeselected);
  document.addEventListener("week-deselected", _onWeekDeselected);

  document.removeEventListener("week-selected", _onWeekSelected);
  document.addEventListener("week-selected", _onWeekSelected);
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
      .attr("opacity", opacity * (isInactive ? 1 : 0.38))
      .style("cursor", isInactive ? "default" : "pointer")
      .on("mouseover", (event) => {
        const weeks = phase.week_end - phase.week_start + 1;
        if (isInactive) {
          // Check if any runs happened during this rest period
          const restRuns = allActivities.filter(a => {
            if (a.type !== "Run") return false;
            const ds = a.start_date.slice(0, 10);
            return ds >= phase.date_start && ds <= phase.date_end;
          });
          let html = `<b style="color:#6B7280">Rest period</b> · ${weeks} weeks`;
          if (restRuns.length > 0) {
            const totalKm = restRuns.reduce((s, a) => s + a.distance / 1000, 0);
            html += `<br><span style="color:#9CA3AF;font-size:12px">${restRuns.length} run${restRuns.length > 1 ? "s" : ""} · ${totalKm.toFixed(1)} km during rest</span>`;
          }
          showTooltip(tooltip, event, html);
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

    // Clip text to segment bounds so it never overflows into adjacent segments
    const clipId = `zt-clip-${phase.id}`;
    const clipPad = 6;
    segG.append("clipPath").attr("id", clipId)
      .append("rect")
        .attr("x", px1 + clipPad).attr("y", 0)
        .attr("width", Math.max(0, bw - clipPad * 2)).attr("height", STRIP_H);

    if (!isInactive && bw >= 44) {
      const hasSubtitle = bw >= 80 && phase.stats;
      const nameLabel   = bw >= 100 ? phase.name : phase.name.split(" / ")[0];

      segG.append("text")
        .attr("x", cx).attr("y", hasSubtitle ? STRIP_H / 2 - 13 : STRIP_H / 2)
        .attr("text-anchor", "middle").attr("dominant-baseline", "middle")
        .style("font-size", bw >= 120 ? "18px" : "15px").style("font-weight", "700")
        .style("pointer-events", "none")
        .attr("clip-path", `url(#${clipId})`)
        .attr("fill", tc).attr("opacity", opacity)
        .text(nameLabel);

      if (hasSubtitle) {
        const s = phase.stats;
        segG.append("text")
          .attr("x", cx).attr("y", STRIP_H / 2 + 13)
          .attr("text-anchor", "middle").attr("dominant-baseline", "middle")
          .style("font-size", "13px").style("pointer-events", "none")
          .attr("clip-path", `url(#${clipId})`)
          .attr("fill", tc).attr("opacity", opacity * 0.8)
          .text(`${phase.duration_weeks}w · ${s.km_per_week?.toFixed(0) ?? "?"} km/wk`);
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

  // Pace range (used when metric === "pace")
  const paceWeeks = visWeekly.filter(w => (w.avg_pace ?? 0) > 0);
  const paceMin   = d3.min(paceWeeks, w => w.avg_pace) || 5;
  const paceMax   = d3.max(paceWeeks, w => w.avg_pace) || 7;
  const pacePad   = (paceMax - paceMin) * 0.18 || 0.2;

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
    chartG.append("line")
      .attr("x1", -4).attr("x2", 0)
      .attr("y1", kmScale(v)).attr("y2", kmScale(v))
      .attr("stroke", "rgba(0,0,0,0.25)").attr("stroke-width", 1);
    chartG.append("text")
      .attr("x", -10).attr("y", kmScale(v))
      .attr("text-anchor", "end").attr("dominant-baseline", "middle")
      .style("font-size", "13px").style("fill", "#4B5563").style("font-weight", "600")
      .text(`${v}`);
  });
  chartG.append("text")
    .attr("transform", `translate(-28,${CHART_H / 2}) rotate(-90)`)
    .attr("text-anchor", "middle")
    .style("font-size", "12px").style("fill", "rgba(99,102,241,0.9)").style("font-weight", "700")
    .text("km / wk");


  const sel = APP_STATE.selectedPhaseId;

  // ── 3-zone HR classification (Easy / Moderate / Hard) ──
  // Thresholds based on % of estimated max HR (max avg HR in data × 1.07 as proxy)
  const allActivities = APP_STATE.activities || [];
  const maxObservedHR = d3.max(allActivities.filter(a => a.average_heartrate), a => a.average_heartrate) || 180;
  const estMaxHR = maxObservedHR * 1.07; // typical avg HR is ~93% of true max
  const HR_MOD  = estMaxHR * 0.75; // below → Easy
  const HR_HARD = estMaxHR * 0.88; // above → Hard, between → Moderate

  // zone: 0=easy, 1=moderate, 2=hard
  function _zone(hr) {
    if (!hr) return 0;
    if (hr < HR_MOD)  return 0; // easy
    if (hr < HR_HARD) return 1; // moderate
    return 2;                    // hard
  }
  const ZONE_COLOR = ["#93C5E8", "#f8e19a", "#f7aaaa"]; // muted blue, muted amber, muted red
  const ZONE_NAME  = ["easy",    "moderate", "hard"];
  function _zoneColor(hr) { return ZONE_COLOR[_zone(hr)]; }
  function _zoneName(hr)  { return ZONE_NAME[_zone(hr)]; }

  // ── Per-run stacked segments (from raw activities) ──
  const runG = chartG.append("g").attr("class", "zt-runs");

  const selWeekLocal = APP_STATE.selectedWeekIdx != null ? APP_STATE.selectedWeekIdx - weekStart : null;

  visWeekly.forEach((w, i) => {
    const ph = phases.find(p => p.id === w.phase_id);
    const opacity = selWeekLocal != null
      ? (i === selWeekLocal ? 1.0 : 0.2)
      : sel != null ? ((ph && ph.id === sel) ? 1.0 : 0.18) : 1;
    const bx = i * barStep;

    // Parse week bounds from weekly entry
    const parts        = w.week?.includes("/") ? w.week.split("/") : [w.week, w.week];
    const wStartStr    = parts[0];
    const wEndStr      = parts[1];
    if (!wStartStr) return;

    // Collect runs for this week — sort easy→hard so hard sits on top visually
    const weekRuns = allActivities
      .filter(a => {
        if (a.type !== "Run") return false;
        const ds = a.start_date.slice(0, 10);
        return ds >= wStartStr && ds <= wEndStr;
      })
      .sort((a, b) => _zone(a.average_heartrate) - _zone(b.average_heartrate));

    // If this week belongs to an Inactive phase — show rest stub regardless of actual runs.
    // Week boundaries are coarser than day boundaries, so partial weeks at gap edges
    // may contain real runs but are classified as rest — suppress bars to stay consistent.
    const isInactiveWeek = ph && ph.type === "Inactive";

    if (weekRuns.length === 0 || isInactiveWeek) {
      runG.append("rect")
        .attr("x", bx).attr("y", CHART_H - 2)
        .attr("width", barW).attr("height", 2)
        .attr("fill", "#E5E7EB").attr("rx", 1)
        .style("pointer-events", "none");
      return;
    }

    // Stack runs from bottom upward; height of each segment ∝ its km on the Y scale
    let yBottom = CHART_H;
    weekRuns.forEach((run, ri) => {
      const km    = run.distance / 1000;
      const segH  = Math.max(4, CHART_H - kmScale(km)); // pixels for this run's km
      const yTop  = yBottom - segH;
      const color = _zoneColor(run.average_heartrate);
      const isTop = ri === weekRuns.length - 1;

      const segPath = isTop
        ? topRoundedRect(bx, yTop, barW, segH, 2)
        : `M${bx},${yTop} h${barW} v${segH} h${-barW} Z`;

      runG.append("path")
        .attr("d", segPath)
        .attr("fill", color)
        .attr("opacity", opacity)
        .style("pointer-events", "none");

      // gray separator line between run segments
      if (ri < weekRuns.length - 1) {
        runG.append("rect")
          .attr("x", bx).attr("y", yTop - 1)
          .attr("width", barW).attr("height", 1.5)
          .attr("fill", "#D1D5DB")
          .style("pointer-events", "none");
      }

      yBottom = yTop;
    });

    // ── Weekly summary tooltip + click overlay ──
    const totalKm  = weekRuns.reduce((s, r) => s + r.distance / 1000, 0);
    const zoneCounts = { Easy: 0, Moderate: 0, Hard: 0 };
    weekRuns.forEach(r => { zoneCounts[_zoneName(r.average_heartrate)]++; });
    const runsWithPace = weekRuns.filter(r => r.average_speed > 0);
    const avgPaceStr = runsWithPace.length
      ? formatPace(runsWithPace.reduce((s, r) => s + 1000 / r.average_speed / 60, 0) / runsWithPace.length)
      : null;
    const runsWithHR = weekRuns.filter(r => r.average_heartrate);
    const avgHR = runsWithHR.length
      ? Math.round(runsWithHR.reduce((s, r) => s + r.average_heartrate, 0) / runsWithHR.length)
      : null;

    const zoneBar = ["Easy","Moderate","Hard"].map(z => {
      if (!zoneCounts[z]) return "";
      const col = z === "Easy" ? "#93C5E8" : z === "Moderate" ? "#D4B870" : "#C97878";
      return `<span style="color:${col};font-weight:600">${z} ${zoneCounts[z]}</span>`;
    }).filter(Boolean).join(" · ");

    const fmtDate = s => s ? s.slice(5).replace("-", "/") : "";
    const weekLabel = wStartStr && wEndStr
      ? `${fmtDate(wStartStr)} → ${fmtDate(wEndStr)}`
      : fmtDate(wStartStr);
    const tooltipHTML = `
      <div style="font-size:12px;color:#9CA3AF;margin-bottom:5px;letter-spacing:0.3px">${weekLabel}</div>
      <div style="font-weight:700;font-size:17px;margin-bottom:8px">${totalKm.toFixed(0)} km · ${weekRuns.length} run${weekRuns.length > 1 ? "s" : ""}</div>
      <div style="font-size:12px;margin-bottom:7px">${zoneBar}</div>
      <div style="font-size:13px;display:flex;flex-direction:column;gap:4px">
        ${avgPaceStr ? `<span><span style="color:#9CA3AF;width:40px;display:inline-block">pace</span>${avgPaceStr}</span>` : ""}
        ${avgHR ? `<span><span style="color:#9CA3AF;width:40px;display:inline-block">HR</span>♥ ${avgHR} bpm</span>` : ""}
      </div>
    `;

    runG.append("rect")
      .attr("x", bx).attr("y", 0)
      .attr("width", barW).attr("height", CHART_H)
      .attr("fill", "transparent")
      .style("cursor", ph && ph.type === "Active" ? "pointer" : "default")
      .on("mouseover", (event) => showTooltip(tooltip, event, tooltipHTML))
      .on("mousemove", (event) => {
        tooltip.style("left", (event.pageX + 12) + "px")
               .style("top",  (event.pageY - 28) + "px");
      })
      .on("mouseout", () => hideTooltip(tooltip))
      .on("click", () => {
        if (APP_STATE.selectedWeekIdx === weekStart + i) {
          APP_STATE.selectedWeekIdx = null;
          document.getElementById("week-detail-section").style.display = "none";
          renderTimeline(weekStart, weekEnd, phasesInRange, bpInRange);
        } else {
          document.getElementById("bp-detail-panel").style.display = "none";
          renderWeekDetail(weekStart + i);
          renderTimeline(weekStart, weekEnd, phasesInRange, bpInRange);
        }
      });
  });

  // ── Selected week highlight ──
  if (selWeekLocal != null && selWeekLocal >= 0 && selWeekLocal < nWeeks) {
    const bx = selWeekLocal * barStep;
    runG.append("rect")
      .attr("x", bx - 1).attr("y", 0)
      .attr("width", barW + 2).attr("height", CHART_H)
      .attr("fill", "none")
      .attr("stroke", "rgba(0,0,0,0.35)")
      .attr("stroke-width", 1.5)
      .attr("rx", 3)
      .style("pointer-events", "none");
  }

  // ── Overlay line: Pace / Avg HR / Efficiency ──
  const metric    = APP_STATE.ztLineMetric ?? "pace";
  const axisX     = innerW + 8;

  // Helper: split array into contiguous segments (gap ≤ 2 weeks allowed)
  function toSegments(data) {
    const segs = []; let cur = [];
    data.forEach(d => {
      if (!cur.length) { cur.push(d); return; }
      if (d.i - cur[cur.length - 1].i <= 2) cur.push(d);
      else { segs.push(cur); cur = [d]; }
    });
    if (cur.length) segs.push(cur);
    return segs;
  }

  // Helper: draw line + dots + right axis
  function drawOverlayLine(points, yScale, color, axisLabel, axisDirection, fmtTick) {
    if (points.length < 2) return;
    const lineGen = d3.line()
      .x(d => d.i * barStep + barW / 2)
      .y(d => yScale(d.v))
      .curve(d3.curveMonotoneX);

    const segs = toSegments(points);
    segs.forEach(seg => {
      if (seg.length < 2) return;
      chartG.append("path").datum(seg)
        .attr("fill", "none").attr("stroke", color)
        .attr("stroke-width", 1.5).attr("opacity", 0.75)
        .attr("d", lineGen).style("pointer-events", "none");
    });

    // Dashed bridges across gaps (rest periods)
    const bridgeLine = d3.line()
      .x(d => d.i * barStep + barW / 2)
      .y(d => yScale(d.v));
    for (let s = 0; s < segs.length - 1; s++) {
      const tail = segs[s][segs[s].length - 1];
      const head = segs[s + 1][0];
      chartG.append("path").datum([tail, head])
        .attr("fill", "none").attr("stroke", color)
        .attr("stroke-width", 1.2).attr("opacity", 0.35)
        .attr("stroke-dasharray", "4 4")
        .attr("d", bridgeLine).style("pointer-events", "none");
    }

    points.forEach(d => {
      chartG.append("circle")
        .attr("cx", d.i * barStep + barW / 2).attr("cy", yScale(d.v))
        .attr("r", 2.5).attr("fill", color).attr("stroke", "white").attr("stroke-width", 1)
        .attr("opacity", 0.85).style("pointer-events", "none");
    });

    // Right Y-axis ticks
    const vMin = d3.min(points, d => d.v);
    const vMax = d3.max(points, d => d.v);
    const mid  = (vMin + vMax) / 2;
    [vMin, mid, vMax].forEach(v => {
      chartG.append("line")
        .attr("x1", axisX - 4).attr("x2", axisX)
        .attr("y1", yScale(v)).attr("y2", yScale(v))
        .attr("stroke", color).attr("stroke-width", 1).attr("opacity", 0.4);
      chartG.append("text")
        .attr("x", axisX + 2).attr("y", yScale(v))
        .attr("dominant-baseline", "middle")
        .style("font-size", "13px").style("fill", color).style("font-weight", "600").style("opacity", "0.9")
        .text(fmtTick(v));
    });
    chartG.append("text")
      .attr("x", axisX + 2).attr("y", -8)
      .style("font-size", "12px").style("fill", color).style("font-weight", "700").style("opacity", "0.9")
      .text(axisLabel);
    chartG.append("text")
      .attr("x", axisX + 2).attr("y", 10)
      .style("font-size", "11px").style("fill", color).style("opacity", "0.55")
      .text(axisDirection);
  }

  if (metric === "pace" && paceWeeks.length >= 2) {
    const points = visWeekly.map((w, i) => ({ i, v: w.avg_pace })).filter(d => d.v > 0);
    // pace: low value = fast = top of chart
    const pScale = d3.scaleLinear()
      .domain([paceMin - pacePad, paceMax + pacePad])
      .range([0, CHART_H]);
    drawOverlayLine(points, pScale, "#D97741", "pace", "faster ↑",
      v => formatPace(v).replace(" /km", ""));
  }

  if (metric === "hr") {
    // Per-week weighted-average HR from raw activities
    const hrPoints = visWeekly.map((w, i) => {
      const parts = w.week?.includes("/") ? w.week.split("/") : [w.week, w.week];
      const ws = parts[0], we = parts[1];
      if (!ws) return null;
      const runs = allActivities.filter(a => {
        if (a.type !== "Run" || !a.average_heartrate) return false;
        const ds = a.start_date.slice(0, 10);
        return ds >= ws && ds <= we;
      });
      if (!runs.length) return null;
      const totalDist = runs.reduce((s, a) => s + a.distance, 0);
      const wHR = runs.reduce((s, a) => s + a.average_heartrate * a.distance, 0) / totalDist;
      return { i, v: wHR };
    }).filter(Boolean);

    if (hrPoints.length >= 2) {
      const hrMin  = d3.min(hrPoints, d => d.v);
      const hrMax  = d3.max(hrPoints, d => d.v);
      const hrPad  = (hrMax - hrMin) * 0.18 || 3;
      // Higher HR = harder effort → top of chart (inverted: domain high→low maps to y=0→CHART_H)
      const hrScale = d3.scaleLinear()
        .domain([hrMax + hrPad, hrMin - hrPad])
        .range([0, CHART_H]);
      drawOverlayLine(hrPoints, hrScale, "#6366F1", "avg HR", "lower ↓",
        v => `${Math.round(v)}`);
    }
  }

  if (metric === "efficiency") {
    // Use pre-computed efficiency from weekly data (avg_speed_ms / avg_heartrate)
    // Display as % change from personal baseline (mean of all non-null weeks)
    const rawEff = visWeekly
      .map((w, i) => w.efficiency != null ? { i, v: w.efficiency } : null)
      .filter(Boolean);

    if (rawEff.length >= 2) {
      const baseline = d3.mean(rawEff, d => d.v);
      const effPoints = rawEff.map(d => ({ i: d.i, v: (d.v - baseline) / baseline * 100 }));
      const effAbs = Math.max(Math.abs(d3.min(effPoints, d => d.v)),
                              Math.abs(d3.max(effPoints, d => d.v))) || 5;
      const effPad = effAbs * 0.2;
      // Higher % = more efficient = top
      const effScale = d3.scaleLinear()
        .domain([-(effAbs + effPad), effAbs + effPad])
        .range([CHART_H, 0]);
      drawOverlayLine(effPoints, effScale, "#10B981", "efficiency", "better ↑",
        v => `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`);
    }
  }

  // ── Bottom border ──
  chartG.append("line")
    .attr("x1", 0).attr("x2", innerW)
    .attr("y1", CHART_H).attr("y2", CHART_H)
    .attr("stroke", "#E5E7EB").attr("stroke-width", 1);

  // ── Breakpoint markers — sit on the strip at phase boundaries ──
  const R = 13;

  function transitionStyle(fromPhase, toPhase, changes) {
    const from = fromPhase.type === "Inactive" ? "Rest" : fromPhase.name;
    const to   = toPhase.type   === "Inactive" ? "Rest" : toPhase.name;
    const kmChange = changes?.km_per_week ?? 0;

    // Rest → Active
    if (from === "Rest")
      return { arrow: "↑", fill: "#DBEAFE", stroke: "#3B82F6", text: "#1D4ED8" };

    // Active → Rest
    if (to === "Rest")
      return { arrow: "↓", fill: "#F3F4F6", stroke: "#9CA3AF", text: "#6B7280" };

    // → Building or Peak (volume growing)
    if (to === "Building" || to === "Peak")
      return { arrow: "↑", fill: "#DCFCE7", stroke: "#22C55E", text: "#15803D" };

    // Peak → Sharpening or Recovery (expected taper)
    if ((from === "Peak" || from === "Building") && (to === "Sharpening" || to === "Recovery"))
      return { arrow: "↓", fill: "#FEF3C7", stroke: "#F59E0B", text: "#B45309" };

    // Unexpected drop (Building → Recovery without going through Peak)
    if (from === "Building" && to === "Recovery" && (kmChange ?? 0) < -20)
      return { arrow: "↓", fill: "#FEE2E2", stroke: "#EF4444", text: "#DC2626" };

    // Generic: follow km direction
    if ((kmChange ?? 0) > 10)
      return { arrow: "↑", fill: "#DCFCE7", stroke: "#22C55E", text: "#15803D" };
    if ((kmChange ?? 0) < -10)
      return { arrow: "↓", fill: "#FEE2E2", stroke: "#EF4444", text: "#DC2626" };

    return { arrow: "→", fill: "white", stroke: "#9CA3AF", text: "#6B7280" };
  }

  bpInRange.forEach(bp => {
    const fromPhase = phases.find(p => p.id === bp.from_id);
    const toPhase   = phases.find(p => p.id === bp.to_id);
    if (!fromPhase || !toPhase) return;

    const style = transitionStyle(fromPhase, toPhase, bp.changes);
    const bpX = x(bp.week_index);
    const cy  = STRIP_H / 2;

    const markerG = stripG.append("g")
      .attr("transform", `translate(${bpX}, ${cy})`)
      .style("cursor", "pointer");

    // Invisible hit area
    markerG.append("rect")
      .attr("x", -R - 8).attr("y", -R - 8)
      .attr("width", (R + 8) * 2).attr("height", (R + 8) * 2)
      .attr("fill", "transparent");

    // White halo for contrast against any phase background
    markerG.append("path")
      .attr("d", `M0,-${R + 3} L${R + 3},0 L0,${R + 3} L-${R + 3},0 Z`)
      .attr("fill", "white")
      .attr("opacity", 0.9)
      .style("pointer-events", "none");

    // Diamond
    const shape = markerG.append("path")
      .attr("d", `M0,-${R} L${R},0 L0,${R} L-${R},0 Z`)
      .attr("fill", style.fill)
      .attr("fill-opacity", 0.95)
      .attr("stroke", style.stroke)
      .attr("stroke-width", 2);

    markerG.append("text")
      .attr("x", 0).attr("y", 0)
      .attr("text-anchor", "middle").attr("dominant-baseline", "middle")
      .style("font-size", "11px").style("font-weight", "700")
      .style("pointer-events", "none")
      .attr("fill", style.text)
      .text(style.arrow);

    markerG
      .on("mouseover", (event) => {
        shape.attr("fill-opacity", 1);
        showTransitionPopover(bp, fromPhase, toPhase, event);
      })
      .on("mouseout", () => {
        shape.attr("fill-opacity", 0.95);
        hideTransitionPopover();
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
  // Density: every week if barStep≥16, every 2nd if ≥8, every 4th if ≥4, month-only if <4
  const dayEvery = barStep >= 16 ? 1 : barStep >= 8 ? 2 : barStep >= 4 ? 4 : 0;

  visWeekly.forEach((w, i) => {
    if (!w.week) return;
    const dateStr  = w.week.includes("/") ? w.week.split("/")[0] : w.week;
    const d        = new Date(dateStr + "T00:00:00");
    const px       = i * barStep;
    const isMonthB = monthBoundaries.some(mb => mb.i === i);

    // Tick mark — always show at month boundary, otherwise by density
    const showTick = isMonthB || (dayEvery > 0 && i % dayEvery === 0);
    if (showTick) {
      axisG.append("line")
        .attr("x1", px).attr("x2", px)
        .attr("y1", 0).attr("y2", isMonthB ? 9 : 5)
        .attr("stroke", isMonthB ? "#6B7280" : "#C1C5CC")
        .attr("stroke-width", isMonthB ? 1.2 : 0.7);
    }

    // Day number — always at month boundaries, otherwise by density
    const showNum = isMonthB || (dayEvery > 0 && i % dayEvery === 0);
    if (showNum) {
      axisG.append("text")
        .attr("x", px + 3).attr("y", DAY_H / 2 + 2)
        .attr("text-anchor", "start").attr("dominant-baseline", "middle")
        .style("font-size", isMonthB ? "12px" : "11px")
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

  document.getElementById("heatmap-section").style.display = "none";
}

// ─────────────────────────────────────────────────────────
// Transition detail panel (single card, shown on diamond click)
// ─────────────────────────────────────────────────────────
function phaseAvgHR(phase) {
  const { weekly, activities } = APP_STATE;
  if (!activities?.length) return null;
  const phaseWeeks = weekly.filter(w => w.phase_id === phase.id);
  if (!phaseWeeks.length) return null;
  const dates = phaseWeeks.flatMap(w => w.week.includes("/") ? w.week.split("/") : [w.week, w.week]);
  const minDate = dates.reduce((a, b) => a < b ? a : b);
  const maxDate = dates.reduce((a, b) => a > b ? a : b);
  const relevant = activities.filter(a =>
    a.type === "Run" && a.average_heartrate &&
    a.start_date.slice(0, 10) >= minDate && a.start_date.slice(0, 10) <= maxDate
  );
  if (!relevant.length) return null;
  return relevant.reduce((s, a) => s + a.average_heartrate, 0) / relevant.length;
}

function buildTransitionHTML(bp, fromPhase, toPhase) {
  const fromTC = phaseTextColor(fromPhase.name);
  const toTC   = phaseTextColor(toPhase.name);
  const ts = toPhase.stats   || {};
  const ch = bp.changes      || {};

  const fromHR = phaseAvgHR(fromPhase);
  const toHR   = phaseAvgHR(toPhase);
  const hrPct  = fromHR && toHR ? ((toHR - fromHR) / fromHR) * 100 : null;

  const fromWeeks = fromPhase.week_end - fromPhase.week_start + 1;
  const toWeeks   = toPhase.week_end   - toPhase.week_start   + 1;

  const cards = [
    { label: "km/week",    pct: ch.km_per_week,    bigger: true,  val: ts.km_per_week  != null ? `${ts.km_per_week.toFixed(0)} km`  : null },
    { label: "pace",       pct: ch.avg_pace,        bigger: false, val: formatPace(ts.avg_pace) },
    { label: "avg run",    pct: ch.avg_run_km,      bigger: true,  val: ts.avg_run_km   != null ? `${ts.avg_run_km.toFixed(1)} km`   : null, skip: ch.avg_run_km == null },
    { label: "HR",         pct: hrPct,              bigger: false, val: toHR != null ? `${Math.round(toHR)} bpm` : null, skip: hrPct == null },
    { label: "runs/wk",   pct: ch.runs_per_week,   bigger: true,  val: ts.runs_per_week != null ? `${ts.runs_per_week.toFixed(1)}`  : null },
    { label: "efficiency", pct: ch.efficiency,      bigger: true,  val: ts.efficiency   != null ? `${(ts.efficiency * 1000).toFixed(1)}` : null, skip: true },
  ].filter(c => !c.skip && c.pct != null && Math.abs(c.pct) >= 2);

  const cardHTML = cards.map(c => {
    const isGood   = c.bigger ? c.pct > 0 : c.pct < 0;
    const pctColor = isGood ? "#16A34A" : "#DC2626";
    const sign     = c.pct > 0 ? "+" : "";
    const pctText  = `${sign}${Math.round(c.pct)}%`;
    return `
      <div class="bpd-card">
        <div class="bpd-card-label">${c.label}</div>
        <div class="bpd-card-pct" style="color:${pctColor}">${pctText}</div>
        ${c.val ? `<div class="bpd-card-val">${c.val}</div>` : ""}
      </div>`;
  }).join("");

  return `
    <div class="bpd-header">
      <span class="bpd-phase-name" style="color:${fromTC}">${fromPhase.name}</span><span class="bpd-dur"> ${fromWeeks}w</span>
      <span class="bpd-arrow"> → </span>
      <span class="bpd-phase-name" style="color:${toTC}">${toPhase.name}</span><span class="bpd-dur"> ${toWeeks}w</span>
    </div>
    <div class="bpd-grid">${cardHTML}</div>`;
}

function showTransitionPopover(bp, fromPhase, toPhase, event) {
  let pop = document.getElementById("bp-popover");
  if (!pop) {
    pop = document.createElement("div");
    pop.id = "bp-popover";
    document.body.appendChild(pop);
  }
  pop.innerHTML = buildTransitionHTML(bp, fromPhase, toPhase);

  const pw = 360;
  pop.style.display = "block";

  const ph = pop.offsetHeight || 200;
  const { clientX: mx, clientY: my } = event;
  const left = Math.min(mx - pw / 2, window.innerWidth - pw - 12);
  const top  = my - ph - 16;   // above the cursor

  pop.style.left = `${Math.max(8, left)}px`;
  pop.style.top  = `${Math.max(8, top)}px`;
}

function hideTransitionPopover() {
  const pop = document.getElementById("bp-popover");
  if (pop) pop.style.display = "none";
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
