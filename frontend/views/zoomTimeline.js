import APP_STATE from "../js/state.js";
import { phaseColor, phaseTextColor } from "../js/colors.js";
import { formatWeekLabel, formatPace, showTooltip, moveTooltip, hideTooltip } from "../js/utils.js";

import { renderWeekDetail } from "./weekDetail.js";

const STRIP_H      = 164;
const STRIP_DIVIDER = 56; // colored top zone / white badge zone boundary
const CHART_H      = 260;
const WEEK_LABEL_H = 70;
const LEGEND_H     = 44;
const MARGIN       = { top: 16, right: 20, bottom: 10, left: 80 };

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
  if (typeof window.updateBackBtn === "function") window.updateBackBtn();
  document.getElementById("heatmap-section").style.display     = "none";
  document.getElementById("bp-section-label").style.display    = "none";
  document.getElementById("breakpoints-container").style.display = "none";

  console.log("[zoom] Rendering weeks", weekStart, "→", weekEnd, "(", nWeeks, "weeks)");
  console.log("[zoom] Phases:", phasesInRange.map(p => p.name));
  console.log("[zoom] Breakpoints in range:", bpInRange.length);

  // ── Phase narrative ──
  const PHASE_DESCRIPTIONS = {
    "Building":   { icon: "↗", tag: "Volume growing week over week", detail: "The body is adapting to increasing load — a preparation stage before peak training.",   sparkline: [20, 28, 38, 50, 60, 70, 82] },
    "Peak":       { icon: "▲", tag: "Highest training load of the cycle", detail: "Volume is at maximum and stable. Typically the hardest period before a race.",       sparkline: [36, 58, 76, 92, 76, 58, 36] },
    "Base":       { icon: "→", tag: "Steady, moderate volume", detail: "No clear growth or drop — maintaining fitness and consistency.",                                  sparkline: [54, 58, 52, 56, 55, 59, 54] },
    "Recovery":   { icon: "↘", tag: "Volume significantly below normal", detail: "Usually follows a peak or race, or reflects illness / low motivation.",                 sparkline: [78, 32, 18, 14, 16, 22, 30] },
    "Sharpening": { icon: "⚡", tag: "Volume drops, pace improves", detail: "Classic pre-race tapering — less km but higher quality. Body is getting sharp.",            sparkline: [88, 82, 74, 64, 52, 40, 30] },
  };

  function makeSparklineSVG(data, color) {
    const W = 200, H = 44, pad = 4;
    const max = Math.max(...data), min = Math.min(...data), range = max - min || 1;
    const pts = data.map((v, i) => [
      pad + (i / (data.length - 1)) * (W - pad * 2),
      H - pad - ((v - min) / range) * (H - pad * 2 - 4)
    ]);
    // smooth bezier through points
    let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
    for (let i = 1; i < pts.length; i++) {
      const cx = (pts[i-1][0] + pts[i][0]) / 2;
      d += ` C${cx.toFixed(1)},${pts[i-1][1].toFixed(1)} ${cx.toFixed(1)},${pts[i][1].toFixed(1)} ${pts[i][0].toFixed(1)},${pts[i][1].toFixed(1)}`;
    }
    const area = `${d} L${pts[pts.length-1][0].toFixed(1)},${H} L${pts[0][0].toFixed(1)},${H} Z`;
    const gid  = `sg${color.replace(/[^a-f0-9]/gi,'')}`;
    return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" class="phase-sparkline-svg" aria-hidden="true">
      <defs>
        <linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="${color}" stop-opacity="0.22"/>
          <stop offset="100%" stop-color="${color}" stop-opacity="0.02"/>
        </linearGradient>
      </defs>
      <path d="${area}" fill="url(#${gid})"/>
      <path d="${d}" fill="none" stroke="${color}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
      ${pts.map((pt, i) => i === pts.length - 1 || i === 0 ? `<circle cx="${pt[0].toFixed(1)}" cy="${pt[1].toFixed(1)}" r="3" fill="${color}" opacity="0.7"/>` : '').join('')}
    </svg>`;
  }
  const narrativeEl = document.getElementById("phase-narrative-block");
  if (narrativeEl) {
    const activeInRange = phasesInRange.filter(p => p.type === "Active");

    // all unique active phases ordered by first appearance
    const seenNames = new Set();
    const uniqueActive = activeInRange
      .slice().sort((a, b) => a.week_start - b.week_start)
      .filter(p => { if (seenNames.has(p.name)) return false; seenNames.add(p.name); return true; });

    if (uniqueActive.length === 0) {
      narrativeEl.innerHTML = "";
    } else {
      const cards = uniqueActive.map((p, i) => {
        const color    = phaseColor(p.name);
        const txtColor = phaseTextColor(p.name);
        const info     = PHASE_DESCRIPTIONS[p.name];
        const delay    = `${i * 90}ms`;
        const sparkSVG = info?.sparkline ? makeSparklineSVG(info.sparkline, color) : "";
        return `<div class="phase-narrative-card" style="--phase-color:${color};--phase-text:${txtColor};--card-delay:${delay}">
          <div class="phase-narrative-header">
            <span class="phase-narrative-icon" style="color:${color}">${info?.icon ?? ""}</span>
            <span class="phase-narrative-name" style="color:${txtColor}">${p.name}</span>
          </div>
          ${info ? `<div class="phase-narrative-tag">${info.tag}</div>
          <p class="phase-narrative-desc">${info.detail}</p>` : ""}
          ${sparkSVG ? `<div class="phase-sparkline-wrap">${sparkSVG}</div>` : ""}
        </div>`;
      }).join("");
      narrativeEl.innerHTML = cards;
    }
  }

  // ── Step 2: Render timeline ──
  if (APP_STATE.ztLineMetric === undefined) APP_STATE.ztLineMetric = null;
  if (APP_STATE.ztShowBars === undefined) APP_STATE.ztShowBars = true;
  if (APP_STATE.ztShowLabels === undefined) APP_STATE.ztShowLabels = true;
  renderTimeline(weekStart, weekEnd, phasesInRange, bpInRange);

  // ── Data-availability warnings ──
  const visWeeklyForCheck = (APP_STATE.weekly || []).slice(weekStart, weekEnd + 1);
  const activeWeeks = visWeeklyForCheck.filter(w => {
    const p = APP_STATE.phases.find(ph => ph.id === w.phase_id);
    return !p || p.type !== "Inactive";
  });

  const weeksWithHR = activeWeeks.filter(w => {
    const parts = w.week?.includes("/") ? w.week.split("/") : [w.week, w.week];
    return (APP_STATE.activities || []).some(a =>
      a.type === "Run" && a.average_heartrate &&
      a.start_date.slice(0, 10) >= parts[0] && a.start_date.slice(0, 10) <= parts[1]
    );
  });
  const missingHRCount = activeWeeks.length - weeksWithHR.length;
  const weeksWithEff   = activeWeeks.filter(w => w.efficiency != null);
  const missingEffCount = activeWeeks.length - weeksWithEff.length;

  const warnEl = document.getElementById("zt-warn-data");
  if (warnEl) {
    const parts = [];
    if (missingHRCount > 0)
      parts.push(missingHRCount === activeWeeks.length
        ? "No heart rate data — Avg HR line cannot be shown."
        : `HR missing for ${missingHRCount} of ${activeWeeks.length} weeks — Avg HR line may have gaps.`);
    if (missingEffCount > 0)
      parts.push(missingEffCount === activeWeeks.length
        ? "No efficiency data — Efficiency line cannot be shown."
        : `Efficiency missing for ${missingEffCount} of ${activeWeeks.length} weeks — Efficiency line may have gaps.`);
    warnEl.style.display = parts.length > 0 ? "" : "none";
    warnEl.dataset.tooltip = parts.join(" ");
  }

  // ── All toggle buttons are mutually exclusive ──
  const distBtn = document.getElementById("zt-dist-toggle");
  const metricBtns = document.querySelectorAll(".zt-toggle-btn[data-metric]");

  function applyToggleState() {
    const barsEl = document.querySelector(".zt-runs");
    if (barsEl) barsEl.style.display = APP_STATE.ztShowBars ? "" : "none";
    if (distBtn) distBtn.classList.toggle("active", APP_STATE.ztShowBars);
    metricBtns.forEach(b => b.classList.toggle("active", b.dataset.metric === APP_STATE.ztLineMetric));
  }

  if (distBtn) {
    distBtn.onclick = () => {
      APP_STATE.ztShowBars = true;
      APP_STATE.ztLineMetric = null;
      applyToggleState();
      renderTimeline(weekStart, weekEnd, phasesInRange, bpInRange);
    };
  }

  metricBtns.forEach(btn => {
    btn.onclick = () => {
      APP_STATE.ztShowBars = false;
      APP_STATE.ztLineMetric = btn.dataset.metric;
      applyToggleState();
      renderTimeline(weekStart, weekEnd, phasesInRange, bpInRange);
    };
  });

  applyToggleState();

  const labelsCheck = document.getElementById("zt-labels-check");
  if (labelsCheck) {
    labelsCheck.checked = APP_STATE.ztShowLabels;
    labelsCheck.onchange = () => {
      APP_STATE.ztShowLabels = labelsCheck.checked;
      renderTimeline(weekStart, weekEnd, phasesInRange, bpInRange);
    };
  }

  // Scroll so Phase Timeline header is at the very top
  setTimeout(() => {
    const el = document.getElementById("section-detail");
    const top = el.getBoundingClientRect().top + window.scrollY + 60;
    window.scrollTo({ top, behavior: "smooth" });
  }, 100);

  // Remove any stale listeners and add fresh ones
  document.removeEventListener("week-deselected", _onWeekDeselected);
  document.addEventListener("week-deselected", _onWeekDeselected);

  document.removeEventListener("week-selected", _onWeekSelected);
  document.addEventListener("week-selected", _onWeekSelected);

  // Show guided tour on first visit — wait for initial scroll to settle
  setTimeout(() => maybeStartPhaseTour(), 950);
}

// ─────────────────────────────────────────────────────────
// Phase Timeline guided tour
// ─────────────────────────────────────────────────────────
const TOUR_KEY = "zt_tour_v1";

function maybeStartPhaseTour() {
  if (localStorage.getItem(TOUR_KEY)) return;
  _startPhaseTour();
}

function _getSvgZoneRect(yOffset, zoneH) {
  const svgEl = document.querySelector("#zoom-timeline-chart svg");
  if (!svgEl) return null;
  const r = svgEl.getBoundingClientRect();
  const attrW = parseFloat(svgEl.getAttribute("width")) || svgEl.clientWidth;
  const attrH = parseFloat(svgEl.getAttribute("height")) || svgEl.clientHeight;
  const sx = attrW > 0 ? r.width  / attrW : 1;
  const sy = attrH > 0 ? r.height / attrH : 1;
  return {
    left:   r.left  + 80 * sx,
    top:    r.top   + yOffset * sy,
    width:  (attrW - 100) * sx,
    height: zoneH * sy,
  };
}

function _startPhaseTour() {
  // step 3 & 4 target SVG zones: strip (phase bands) and bars (chart)
  const steps = [
    {
      getTarget: () => document.getElementById("phase-narrative-block"),
      title: "Phase analysis",
      text: "Read about each selected phase — type, tag, and trend. Weekly stats are shown below.",
      position: "below",
      scroll: false,
    },
    {
      getTarget: () => document.getElementById("zt-line-toggle"),
      title: "Switch metric",
      text: "Toggle between Distance, Pace, HR, or Efficiency to update the chart.",
      position: "above",
      scroll: false,
      onLeave: () => {
        // Ensure Distance bars are visible before the column-highlight step
        const distBtn = document.getElementById("zt-dist-toggle");
        if (distBtn && !distBtn.classList.contains("active")) distBtn.click();
      },
    },
    {
      getTarget: () => document.querySelector(".zt-tour-change-group"),
      title: "Changes vs previous phase",
      text: "Each badge shows how a metric shifted compared to the prior phase.",
      position: "below",
      scroll: true,
      pad: 14,
    },
    {
      getTarget: () => _getSvgZoneRect(16 + 164, 260),
      extraTarget: () => document.querySelector(".zt-tour-legend"),
      title: "Weekly stats & intensity",
      text: "Bars show volume per week. Colour = run intensity — easy, moderate, or hard.",
      position: "above",
      scroll: true,
    },
    {
      getTarget: () => document.querySelector(".zt-tour-week-col"),
      title: "Click a week",
      text: "Try it — click any bar to see the individual runs for that week.",
      position: "above",
      scroll: true,
      interactive: true, // tour ends on week click or 5s timeout
    },
  ];

  let step = 0;
  let weekListener = null;
  let autoCloseTimer = null;

  const overlay = document.createElement("div");
  overlay.id = "zt-tour-overlay";
  document.body.appendChild(overlay);

  function getRect(getTarget) {
    const t = getTarget();
    if (!t) return null;
    if (typeof t.getBoundingClientRect === "function") return t.getBoundingClientRect();
    return t;
  }

  function showStep(idx) {
    const s = steps[idx];

    if (s.scroll) {
      const r0 = getRect(s.getTarget);
      if (!r0) { advance(); return; }
      const pageY = r0.top + window.scrollY;
      const target = pageY - window.innerHeight / 2 + r0.height / 2;
      window.scrollTo({ top: Math.max(0, target), behavior: "smooth" });
      setTimeout(() => renderStep(idx), 360);
    } else {
      renderStep(idx);
    }
  }

  function renderStep(idx) {
    const s = steps[idx];
    const rect = getRect(s.getTarget);
    if (!rect) { advance(); return; }

    const PAD = s.pad ?? 10;
    const hl = rect.left - PAD;
    const ht = rect.top  - PAD;
    const hw = rect.width  + PAD * 2;
    const hh = rect.height + PAD * 2;

    let extraHlHTML = "";
    if (s.extraTarget) {
      const er = getRect(s.extraTarget);
      if (er) {
        const ep = 6;
        extraHlHTML = `<div class="zt-tour-highlight zt-tour-highlight--extra"
          style="left:${er.left - ep}px;top:${er.top - ep}px;width:${er.width + ep * 2}px;height:${er.height + ep * 2}px;"></div>`;
      }
    }

    overlay.innerHTML = `
      <div class="zt-tour-highlight"
           style="left:${hl}px;top:${ht}px;width:${hw}px;height:${hh}px;"></div>
      ${extraHlHTML}
      <div class="zt-tour-card" id="zt-tour-card">
        <div class="zt-tour-counter">${idx + 1} / ${steps.length}</div>
        <div class="zt-tour-title">${s.title}</div>
        <div class="zt-tour-text">${s.text}</div>
        <div class="zt-tour-actions">
          <button class="zt-tour-skip">Skip</button>
          ${s.interactive
            ? `<span class="zt-tour-hint">↓ click the bar</span>`
            : `<button class="zt-tour-next">${idx === steps.length - 1 ? "Done ✓" : "Next →"}</button>`}
        </div>
      </div>`;

    positionCard(hl, ht, hw, hh, s.position);

    if (!s.interactive) {
      overlay.querySelector(".zt-tour-next").onclick = advance;
    }
    overlay.querySelector(".zt-tour-skip").onclick = endTour;

    // For the interactive step: pulse the column, listen for click, auto-close after 5s
    if (s.interactive) {
      // Pulsing column overlay
      const colEl = document.querySelector(".zt-tour-week-col");
      if (colEl) {
        const cr = colEl.getBoundingClientRect();
        const pulse = document.createElement("div");
        pulse.className = "zt-tour-pulse-col";
        pulse.style.cssText = `left:${cr.left}px;top:${cr.top}px;width:${cr.width}px;height:${cr.height}px;`;
        overlay.appendChild(pulse);
      }

      if (weekListener) document.removeEventListener("zt-week-bar-click", weekListener);
      weekListener = () => endTour();
      document.addEventListener("zt-week-bar-click", weekListener, { once: true });

      if (autoCloseTimer) clearTimeout(autoCloseTimer);
      autoCloseTimer = setTimeout(() => endTour(), 3000);
    }
  }

  function positionCard(hl, ht, hw, hh, position) {
    const card = document.getElementById("zt-tour-card");
    const CARD_W = 280;
    const CARD_H = 155;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let top, left;

    if (position === "below") {
      top = ht + hh + 14;
      if (top + CARD_H > vh - 16) top = ht - CARD_H - 14;
    } else {
      top = ht - CARD_H - 14;
      if (top < 16) top = ht + hh + 14;
    }
    left = hl + hw / 2 - CARD_W / 2;
    left = Math.max(16, Math.min(left, vw - CARD_W - 16));

    card.style.top   = top  + "px";
    card.style.left  = left + "px";
    card.style.width = CARD_W + "px";
  }

  function advance() {
    const current = steps[step];
    if (current.onLeave) current.onLeave();
    step++;
    if (step >= steps.length) endTour();
    else showStep(step);
  }

  function endTour() {
    if (weekListener) document.removeEventListener("zt-week-bar-click", weekListener);
    if (autoCloseTimer) clearTimeout(autoCloseTimer);
    localStorage.setItem(TOUR_KEY, "1");
    overlay.remove();
  }

  showStep(0);
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
  const totalH = MARGIN.top + STRIP_H + CHART_H + WEEK_LABEL_H + LEGEND_H + MARGIN.bottom;

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
  let _firstBadgeMarked = false; // used to tag one badge for the tour spotlight

  // Build prev-active-phase lookup directly from phase stats (more reliable than breakpoints)
  const allActivePhases = (APP_STATE.phases || phasesInRange)
    .filter(p => p.type === "Active")
    .sort((a, b) => a.week_start - b.week_start);
  const prevActivePhase = {};
  allActivePhases.forEach((p, i) => {
    if (i > 0) prevActivePhase[p.id] = allActivePhases[i - 1];
  });

  function pctChange(a, b, bigger = true) {
    if (a == null || b == null || a === 0) return null;
    const d = (b - a) / Math.abs(a) * 100;
    return bigger ? d : -d;
  }

  function drawStripSeg(phase) {
    const px1 = x(Math.max(phase.week_start, weekStart));
    const px2 = x(Math.min(phase.week_end + 1, weekEnd + 1));
    const bw  = Math.max(1, px2 - px1);
    const isInactive = phase.type === "Inactive";
    const sel = APP_STATE.selectedPhaseId;
    const opacity = sel == null ? 1 : (phase.id === sel ? 1 : 0.3);

    const segG = stripG.append("g");

    // For inactive phases: fill bottom zone with page bg color
    if (isInactive) {
      segG.append("rect")
        .attr("x", px1).attr("y", STRIP_DIVIDER)
        .attr("width", bw).attr("height", STRIP_H - STRIP_DIVIDER)
        .attr("fill", "#FAFAF9")
        .style("pointer-events", "none");
    }

    // Background — hover/click only on top zone (phase name area)
    segG.append("rect")
      .attr("x", px1).attr("y", 0)
      .attr("width", bw).attr("height", STRIP_DIVIDER)
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
      .on("mousemove", (event) => moveTooltip(tooltip, event))
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

      // Compute changes vs previous active phase directly from stats
      const prevPhase = prevActivePhase[phase.id];
      const cs  = phase.stats    || {};
      const ps  = prevPhase?.stats || {};
      const fromHR = prevPhase ? phaseAvgHR(prevPhase) : null;
      const toHR   = phaseAvgHR(phase);
      const hrPct  = fromHR && toHR ? ((toHR - fromHR) / fromHR) * 100 : null;

      // Choose which metrics to show based on active tab
      const activeTab = APP_STATE.ztLineMetric; // null | "pace" | "hr" | "efficiency"
      const allCandidates = [
        { key: "km/wk",   pct: pctChange(ps.km_per_week,   cs.km_per_week),   bigger: true  },
        { key: "pace",    pct: pctChange(ps.avg_pace,       cs.avg_pace, false), bigger: false },
        { key: "avg run", pct: pctChange(ps.avg_run_km,     cs.avg_run_km),    bigger: true  },
        { key: "HR",      pct: hrPct,                                           bigger: false },
        { key: "runs/wk", pct: pctChange(ps.runs_per_week,  cs.runs_per_week), bigger: true  },
        { key: "effic",   pct: pctChange(ps.efficiency,     cs.efficiency),    bigger: true  },
      ];
      const tabKeys = !activeTab            ? ["km/wk", "avg run", "runs/wk"]
                    : activeTab === "pace"  ? ["pace", "km/wk"]
                    : activeTab === "hr"    ? ["HR", "pace"]
                    :                        ["effic", "HR", "pace"]; // efficiency

      const changeMetrics = allCandidates
        .filter(m => tabKeys.includes(m.key) && m.pct != null && Math.abs(m.pct) >= 2);

      const hasChanges = bw >= 80 && changeMetrics.length > 0;

      // White badge zone background (always draw for active phases wide enough)
      if (!isInactive && bw >= 80) {
        segG.append("rect")
          .attr("x", px1).attr("y", STRIP_DIVIDER)
          .attr("width", bw).attr("height", STRIP_H - STRIP_DIVIDER)
          .attr("fill", "#FAFAF9").attr("opacity", opacity)
          .style("pointer-events", "none");
      }

      // Name + subtitle: always centered in the colored top zone
      const topCenter = STRIP_DIVIDER / 2;
      const nameY = hasSubtitle ? topCenter - 10 : topCenter;
      const subY  = topCenter + 10;

      segG.append("text")
        .attr("x", cx).attr("y", nameY)
        .attr("text-anchor", "middle").attr("dominant-baseline", "middle")
        .style("font-size", bw >= 120 ? "18px" : "15px").style("font-weight", "700")
        .style("pointer-events", "none")
        .attr("clip-path", `url(#${clipId})`)
        .attr("fill", tc).attr("opacity", opacity)
        .text(nameLabel);

      if (hasSubtitle) {
        const s = phase.stats;
        const subtitleText = bw >= 150 && s.avg_pace
          ? `${phase.duration_weeks}w · ${s.km_per_week?.toFixed(0) ?? "?"} km/wk · ${formatPace(s.avg_pace)}`
          : `${phase.duration_weeks}w · ${s.km_per_week?.toFixed(0) ?? "?"} km/wk`;
        segG.append("text")
          .attr("x", cx).attr("y", subY)
          .attr("text-anchor", "middle").attr("dominant-baseline", "middle")
          .style("font-size", "12px").style("pointer-events", "none")
          .attr("clip-path", `url(#${clipId})`)
          .attr("fill", tc).attr("opacity", opacity * 0.8)
          .text(subtitleText);
      }

      if (!hasChanges && bw >= 80 && prevPhase) {
        // No significant changes — show a short neutral note
        const noChangeLabel = !activeTab           ? "volume unchanged"
                            : activeTab === "pace" ? "pace unchanged"
                            : activeTab === "hr"   ? "HR unchanged"
                            :                       "efficiency unchanged";
        const zoneCenter = STRIP_DIVIDER + (STRIP_H - STRIP_DIVIDER) / 2;
        segG.append("text")
          .attr("x", cx).attr("y", zoneCenter)
          .attr("text-anchor", "middle").attr("dominant-baseline", "middle")
          .style("font-size", "11px").style("pointer-events", "none")
          .attr("clip-path", `url(#${clipId})`)
          .attr("fill", "#9CA3AF").attr("opacity", opacity)
          .text(`— ${noChangeLabel}`);
      }

      if (hasChanges) {
        // Adaptive sizing based on available width
        const isCompact = bw < 130;
        const BADGE_H   = isCompact ? 14 : 20;
        const PAD_X     = isCompact ? 5  : 10;
        const GAP       = isCompact ? 4  : 8;
        const FONT      = isCompact ? 9  : 12;
        const CHAR_W    = isCompact ? 5.5 : 7.0;

        const n = changeMetrics.length;
        const totalStackH = n * BADGE_H + (n - 1) * GAP;
        const zoneH = STRIP_H - STRIP_DIVIDER;
        const startY = STRIP_DIVIDER + (zoneH - totalStackH) / 2 + BADGE_H / 2;

        const badgeG = segG.append("g")
          .attr("clip-path", `url(#${clipId})`)
          .style("pointer-events", "none");
        if (!_firstBadgeMarked) {
          badgeG.attr("class", "zt-tour-change-group");
          _firstBadgeMarked = true;
        }

        changeMetrics.forEach((m, idx) => {
          const isGood    = m.bigger ? m.pct > 0 : m.pct < 0;
          const bgColor   = isGood ? "#DCFCE7" : "#FEE2E2";
          const textColor = isGood ? "#15803D" : "#DC2626";
          const arrow     = m.pct > 0 ? "↑" : "↓";
          const sign      = m.pct > 0 ? "+" : "";
          // Compact mode: shorter key labels
          const keyShort  = isCompact
            ? { "km/wk": "km", "avg run": "run", "runs/wk": "runs", "pace": "pace", "HR": "HR", "effic": "eff" }[m.key] ?? m.key
            : m.key;
          const label     = isCompact
            ? `${arrow}${keyShort} ${sign}${Math.round(m.pct)}%`
            : `${arrow} ${m.key}  ${sign}${Math.round(m.pct)}%`;
          const approxW   = Math.min(bw - 10, label.length * CHAR_W + PAD_X * 2);
          const by        = startY + idx * (BADGE_H + GAP);
          const bx        = cx - approxW / 2;

          badgeG.append("rect")
            .attr("x", bx).attr("y", by - BADGE_H / 2)
            .attr("width", approxW).attr("height", BADGE_H)
            .attr("rx", isCompact ? 5 : 8)
            .attr("fill", bgColor).attr("opacity", opacity);

          badgeG.append("text")
            .attr("x", cx).attr("y", by)
            .attr("text-anchor", "middle").attr("dominant-baseline", "middle")
            .style("font-size", `${FONT}px`).style("font-weight", "700")
            .attr("fill", textColor).attr("opacity", opacity)
            .text(label);
        });
      }
    } else if (isInactive && bw >= 18) {
      segG.append("text")
        .attr("x", cx).attr("y", STRIP_DIVIDER / 2)
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

  // ── Phase background tints (chart area only) ──
  const chartBgH = STRIP_H + CHART_H;
  activeInRange.forEach(phase => {
    const x1 = x(Math.max(phase.week_start, weekStart));
    const x2 = x(Math.min(phase.week_end + 1, weekEnd + 1));
    if (x2 <= x1) return;
    root.append("rect")
      .attr("x", x1).attr("y", STRIP_H)
      .attr("width", x2 - x1).attr("height", CHART_H)
      .attr("fill", phaseColor(phase.name))
      .attr("opacity", 0.07)
      .style("pointer-events", "none");
  });

  // ── Phase boundary lines (full height: strip + chart + week labels) ──
  const fullH = STRIP_H + CHART_H + WEEK_LABEL_H;
  phasesInRange.forEach(phase => {
    const boundaries = [];
    if (phase.week_start > weekStart) boundaries.push(phase.week_start);
    if (phase.week_end + 1 <= weekEnd)  boundaries.push(phase.week_end + 1);
    boundaries.forEach(wi => {
      const px = x(wi);
      root.append("line")
        .attr("x1", px).attr("x2", px)
        .attr("y1", 0).attr("y2", fullH)
        .attr("stroke", "#D1D5DB")
        .attr("stroke-width", 1)
        .style("pointer-events", "none");
    });
  });

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
      .attr("stroke", mb.month === 0 ? "#9CA3AF" : "#E2E4E8")
      .attr("stroke-width", mb.month === 0 ? 1.5 : 0.8)
      .attr("stroke-dasharray", mb.month === 0 ? "4 3" : "3 3")
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

  // ── Left Y-axis (km/wk) — only when distance is shown ──
  if (!APP_STATE.ztLineMetric) {
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
  }


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
  const runG = chartG.append("g").attr("class", "zt-runs")
    .style("display", APP_STATE.ztShowBars === false ? "none" : "");

  const selWeekLocal = APP_STATE.selectedWeekIdx != null ? APP_STATE.selectedWeekIdx - weekStart : null;

  // Tour: mark the first week at/after midpoint that has runs
  let _tourWeekColMarked = false;
  const _tourWeekColTarget = Math.floor(nWeeks / 2);

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

    const colOverlay = runG.append("rect")
      .attr("x", bx).attr("y", 0)
      .attr("width", barW).attr("height", CHART_H)
      .attr("fill", "transparent")
      .style("cursor", ph && ph.type === "Active" ? "pointer" : "default");
    if (!_tourWeekColMarked && i >= _tourWeekColTarget) {
      colOverlay.attr("class", "zt-tour-week-col");
      _tourWeekColMarked = true;
    }
    colOverlay
      .on("mouseover", (event) => showTooltip(tooltip, event, tooltipHTML))
      .on("mousemove", (event) => moveTooltip(tooltip, event))
      .on("mouseout", () => hideTooltip(tooltip))
      .on("click", () => {
        document.dispatchEvent(new CustomEvent("zt-week-bar-click"));
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

  // ── Bar labels: global peak + per-phase max & min ──
  if (!APP_STATE.ztLineMetric && barW >= 16 && APP_STATE.ztShowLabels !== false) {
    const weekMeta = visWeekly.map((w, i) => {
      const ph = phases.find(p => p.id === w.phase_id);
      return { w, i, km: w.km_total ?? 0, phaseId: w.phase_id, inactive: ph?.type === "Inactive" };
    });
    const activeWeekMeta = weekMeta.filter(d => !d.inactive && d.km > 0);

    if (activeWeekMeta.length > 0) {
      const globalPeakIdx = activeWeekMeta.reduce((b, d) => d.km > b.km ? d : b).i;

      // For each active phase find local max and min (km > 0)
      const labelMap = new Map(); // i → { km, type: "peak"|"phase-max"|"phase-min" }

      activeInRange.forEach(phase => {
        const phaseWeeks = activeWeekMeta.filter(d => d.phaseId === phase.id);
        if (phaseWeeks.length === 0) return;

        const phMax = phaseWeeks.reduce((b, d) => d.km > b.km ? d : b);
        const phMin = phaseWeeks.reduce((b, d) => d.km < b.km ? d : b);

        const maxType = phMax.i === globalPeakIdx ? "peak" : "phase-max";
        labelMap.set(phMax.i, { km: phMax.km, type: maxType });

        // Only add min if it's a different week than max
        if (phMin.i !== phMax.i) {
          // Don't overwrite a peak label with a min label
          if (!labelMap.has(phMin.i) || labelMap.get(phMin.i).type === "phase-min") {
            labelMap.set(phMin.i, { km: phMin.km, type: "phase-min" });
          }
        }
      });

      const labelG = chartG.append("g")
        .attr("class", "zt-bar-labels")
        .style("pointer-events", "none");

      labelMap.forEach(({ km, type }, i) => {
        const cx = i * barStep + barW / 2;
        const by = kmScale(km) - 5;
        const color  = (type === "peak" || type === "phase-max") ? "#6366F1" : "#94A3B8";
        const weight = (type === "peak" || type === "phase-max") ? "700" : "500";

        labelG.append("text")
          .attr("x", cx).attr("y", by)
          .attr("text-anchor", "middle")
          .attr("dominant-baseline", "auto")
          .style("font-size", "11px")
          .style("font-weight", weight)
          .attr("fill", color)
          .text(`${km.toFixed(0)} km`);
      });
    }
  }

  // ── Overlay line: Pace / Avg HR / Efficiency ──
  const metric    = APP_STATE.ztLineMetric;
  let lineHoverData = null; // { points, yScale, fmtTick, color, axisLabel }
  if (metric) {

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

  // Helper: draw line + dots + left axis
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

    // Save for hover interaction
    lineHoverData = { points, yScale, fmtTick, color, axisLabel };

    // Left Y-axis ticks
    const vMin = d3.min(points, d => d.v);
    const vMax = d3.max(points, d => d.v);
    const mid  = (vMin + vMax) / 2;
    [vMin, mid, vMax].forEach(v => {
      chartG.append("line")
        .attr("x1", -4).attr("x2", 0)
        .attr("y1", yScale(v)).attr("y2", yScale(v))
        .attr("stroke", color).attr("stroke-width", 1).attr("opacity", 0.4);
      chartG.append("text")
        .attr("x", -10).attr("y", yScale(v))
        .attr("text-anchor", "end").attr("dominant-baseline", "middle")
        .style("font-size", "13px").style("fill", color).style("font-weight", "600").style("opacity", "0.9")
        .text(fmtTick(v));
    });
    chartG.append("text")
      .attr("transform", `translate(-62,${CHART_H / 2}) rotate(-90)`)
      .attr("text-anchor", "middle")
      .style("font-size", "12px").style("fill", color).style("font-weight", "700").style("opacity", "0.9")
      .text(`${axisLabel} ${axisDirection}`);
  }

  // ── Per-phase max/min labels on line ──
  function drawLineLabels(points, yScale, fmtTick) {
    if (points.length === 0 || barW < 16 || APP_STATE.ztShowLabels === false) return;

    const labelMap = new Map(); // localI → { v, type: "best"|"worst" }

    activeInRange.forEach(phase => {
      const phPts = points.filter(d => {
        const gi = weekStart + d.i;
        return gi >= phase.week_start && gi <= phase.week_end;
      });
      if (phPts.length === 0) return;

      // lowest y = visually highest on chart = "best"
      const best  = phPts.reduce((b, d) => yScale(d.v) < yScale(b.v) ? d : b);
      const worst = phPts.reduce((b, d) => yScale(d.v) > yScale(b.v) ? d : b);

      labelMap.set(best.i, { v: best.v, type: "best" });
      if (worst.i !== best.i && !labelMap.has(worst.i))
        labelMap.set(worst.i, { v: worst.v, type: "worst" });
    });

    labelMap.forEach(({ v, type }, i) => {
      const cx    = i * barStep + barW / 2;
      const cy    = yScale(v);
      const above = type === "best";
      const color  = above ? "#6366F1" : "#94A3B8";
      const weight = above ? "700" : "500";
      const dy     = above ? -10 : 10;

      chartG.append("text")
        .attr("x", cx).attr("y", cy + dy)
        .attr("text-anchor", "middle")
        .attr("dominant-baseline", above ? "auto" : "hanging")
        .style("font-size", "11px")
        .style("font-weight", weight)
        .attr("fill", color)
        .style("pointer-events", "none")
        .text(fmtTick(v));
    });
  }

  if (metric === "pace" && paceWeeks.length >= 2) {
    const points = visWeekly.map((w, i) => ({ i, v: w.avg_pace })).filter(d => d.v > 0);
    // pace: low value = fast = top of chart
    const pScale = d3.scaleLinear()
      .domain([paceMin - pacePad, paceMax + pacePad])
      .range([0, CHART_H]);
    drawOverlayLine(points, pScale, "#D97741", "pace", "faster ↑",
      v => formatPace(v).replace(" /km", ""));
    drawLineLabels(points, pScale, v => formatPace(v).replace(" /km", ""));
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
      drawLineLabels(hrPoints, hrScale, v => `${Math.round(v)} bpm`);
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
      drawLineLabels(effPoints, effScale, v => `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`);
    }
  }

  // ── Line hover overlay (crosshair + tooltip on curve) ──
  if (lineHoverData) {
    const { points, yScale, fmtTick, color } = lineHoverData;

    const crossLine = chartG.append("line")
      .attr("y1", 0).attr("y2", CHART_H)
      .attr("stroke", "rgba(0,0,0,0.18)").attr("stroke-width", 1)
      .attr("stroke-dasharray", "3,3").style("display", "none")
      .style("pointer-events", "none");

    const hoverDot = chartG.append("circle")
      .attr("r", 5).attr("fill", color).attr("stroke", "white").attr("stroke-width", 2)
      .style("display", "none").style("pointer-events", "none");

    chartG.append("rect")
      .attr("x", 0).attr("y", 0)
      .attr("width", innerW).attr("height", CHART_H)
      .attr("fill", "transparent")
      .style("cursor", "crosshair")
      .on("mousemove", (event) => {
        const [mx] = d3.pointer(event);
        // Find nearest point by x distance
        let nearest = null, minDist = Infinity;
        points.forEach(d => {
          const px = d.i * barStep + barW / 2;
          const dist = Math.abs(px - mx);
          if (dist < minDist) { minDist = dist; nearest = d; }
        });
        if (!nearest || minDist > barStep * 1.5) {
          crossLine.style("display", "none");
          hoverDot.style("display", "none");
          hideTooltip(tooltip);
          return;
        }

        const px = nearest.i * barStep + barW / 2;
        const py = yScale(nearest.v);
        crossLine.style("display", null).attr("x1", px).attr("x2", px);
        hoverDot.style("display", null).attr("cx", px).attr("cy", py);

        const w = visWeekly[nearest.i];
        const parts = w?.week?.includes("/") ? w.week.split("/") : [w?.week, w?.week];
        const fmtD = s => { if (!s) return ""; const [y, mo, dy] = s.split("-").map(Number); return new Date(y, mo - 1, dy).toLocaleDateString("en-US", { month: "short", day: "numeric" }); };
        const weekLabel = parts[0] && parts[1] && parts[0] !== parts[1]
          ? `${fmtD(parts[0])} – ${fmtD(parts[1])}`
          : fmtD(parts[0]);
        showTooltip(tooltip, event,
          `<div style="font-size:12px;color:#9CA3AF;margin-bottom:4px">${weekLabel}</div>
           <div style="font-weight:700;font-size:16px;color:${color}">${fmtTick(nearest.v)}</div>`);
      })
      .on("mouseleave", () => {
        crossLine.style("display", "none");
        hoverDot.style("display", "none");
        hideTooltip(tooltip);
      });
  }

  // ── Bottom border ──
  chartG.append("line")
    .attr("x1", 0).attr("x2", innerW)
    .attr("y1", CHART_H).attr("y2", CHART_H)
    .attr("stroke", "#E5E7EB").attr("stroke-width", 1);

  } // end if (metric)

  // ─────────────────────────────────────────
  // ROW 3 — Time axis: day ticks + month bands
  // ─────────────────────────────────────────
  const axisG = root.append("g")
    .attr("transform", `translate(0,${STRIP_H + CHART_H})`);

  const DAY_H  = 18;   // day-numbers row height
  const BAND_H = 20;   // month band height
  const YEAR_H = 20;   // year band height

  // Pre-compute year boundaries
  const yearBoundaries = [];
  { let lastYr = null;
    monthBoundaries.forEach(mb => {
      if (mb.year !== lastYr) { yearBoundaries.push({ i: mb.i, year: mb.year }); lastYr = mb.year; }
    });
  }

  // Axis baseline
  axisG.append("line")
    .attr("x1", 0).attr("x2", innerW)
    .attr("y1", 0).attr("y2", 0)
    .attr("stroke", "#C8CAD0").attr("stroke-width", 1);

  // ── Month bands (middle row) ──
  const bandY = DAY_H + 2;
  const yearY = bandY + BAND_H + 2;

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

    // Month name — no year suffix, year is shown in the dedicated year row below
    const fullName  = mb.date.toLocaleDateString("en-US", { month: "long" });
    const shortName = mb.date.toLocaleDateString("en-US", { month: "short" });
    const label = spanPx >= 100 ? fullName : spanPx >= 36 ? shortName : "";
    if (!label) return;

    axisG.append("text")
      .attr("x", px1 + spanPx / 2).attr("y", bandY + BAND_H / 2)
      .attr("text-anchor", "middle").attr("dominant-baseline", "middle")
      .style("font-size", spanPx >= 100 ? "12px" : "11px")
      .style("font-weight", "600")
      .style("fill", "#374151")
      .text(label);
  });

  // ── Year bands (bottom row) — dark background, white text, bold year numbers ──
  const yearPalette = ["#334155", "#1e3a5f"];
  yearBoundaries.forEach((yb, idx) => {
    const px1 = yb.i * barStep;
    const px2 = idx + 1 < yearBoundaries.length
      ? yearBoundaries[idx + 1].i * barStep
      : innerW;
    const spanPx = px2 - px1;
    if (spanPx < 2) return;

    axisG.append("rect")
      .attr("x", px1).attr("y", yearY)
      .attr("width", spanPx).attr("height", YEAR_H)
      .attr("fill", yearPalette[idx % yearPalette.length]);

    // Strong year boundary line through all rows
    if (yb.i > 0) {
      axisG.append("line")
        .attr("x1", px1).attr("x2", px1)
        .attr("y1", 0).attr("y2", yearY + YEAR_H)
        .attr("stroke", "#1F2937").attr("stroke-width", 2);
    }

    if (spanPx < 24) return;
    axisG.append("text")
      .attr("x", px1 + spanPx / 2).attr("y", yearY + YEAR_H / 2)
      .attr("text-anchor", "middle").attr("dominant-baseline", "middle")
      .style("font-size", spanPx >= 80 ? "12px" : "10px")
      .style("font-weight", "700")
      .style("fill", "#FFFFFF")
      .text(yb.year);
  });

  // ─────────────────────────────────────────
  // ROW 4 — Phase legend
  // ─────────────────────────────────────────
  const legendG = root.append("g")
    .attr("class", "zt-tour-legend")
    .attr("transform", `translate(0,${STRIP_H + CHART_H + WEEK_LABEL_H})`);

  const lcy = 14; // items row y — tight, no extra gap

  // HR zone swatches — "run intensity" label then swatches left-to-right
  const ZONE_ITEMS = [
    { color: "#93C5E8", label: "easy run",     tip: "Average HR below 75% of estimated max. Comfortable aerobic effort." },
    { color: "#f8e19a", label: "moderate run",  tip: "Average HR 75–88% of estimated max. Steady effort, aerobic threshold zone." },
    { color: "#f7aaaa", label: "hard run",      tip: "Average HR above 88% of estimated max. High intensity, race-pace or interval effort." },
  ];

  // "run intensity" label on the left of the row
  legendG.append("text").attr("x", 0).attr("y", lcy)
    .attr("dominant-baseline", "middle")
    .style("font-size", "13px").style("fill", "#9CA3AF")
    .style("text-transform", "uppercase").style("letter-spacing", "0.05em")
    .text("run intensity");

  let rx = "run intensity".length * 8 + 16; // start after the label
  ZONE_ITEMS.forEach(z => {
    const itemW = 12 + z.label.length * 8 + 16;
    const zG = legendG.append("g").style("cursor", "default")
      .on("mouseover", (event) => showTooltip(tooltip, event,
        `<div style="font-weight:700;font-size:13px;color:${z.color};margin-bottom:5px">${z.label}</div>
         <div style="color:#6B7280;font-size:12px;line-height:1.5;max-width:210px">${z.tip}</div>`))
      .on("mousemove", (event) => moveTooltip(tooltip, event))
      .on("mouseout", () => hideTooltip(tooltip));
    zG.append("rect")
      .attr("x", rx).attr("y", lcy - 6)
      .attr("width", 12).attr("height", 12).attr("rx", 2)
      .attr("fill", z.color);
    zG.append("text")
      .attr("x", rx + 16).attr("y", lcy)
      .attr("dominant-baseline", "middle")
      .style("font-size", "13px").style("fill", "#6B7280")
      .text(z.label);
    zG.append("rect").attr("x", rx).attr("y", lcy - 10)
      .attr("width", itemW).attr("height", 20).attr("fill", "transparent");
    rx += itemW;
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
