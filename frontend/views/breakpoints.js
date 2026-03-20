import APP_STATE from "../js/state.js";
import { phaseColor, phaseTextColor } from "../js/colors.js";
import { pctLabel, pctColor } from "../js/utils.js";

// ─────────────────────────────────────────────────────────
// Public: renderBreakpoints
// ─────────────────────────────────────────────────────────
export function renderBreakpoints(weekStart, weekEnd) {
  const container = document.getElementById("breakpoints-container");
  container.innerHTML = "";

  const { breakpoints, phases, zoomRange, meta } = APP_STATE;

  // Resolve range from args or APP_STATE
  const ws = weekStart ?? zoomRange?.weekStart;
  const we = weekEnd   ?? zoomRange?.weekEnd;

  if (ws == null || we == null || !breakpoints.length) {
    container.innerHTML = '<p class="no-bp">No phase transitions in this period.</p>';
    return;
  }

  const bpInRange = breakpoints.filter(bp =>
    bp.week_index >= ws && bp.week_index <= we
  );

  if (!bpInRange.length) {
    container.innerHTML = '<p class="no-bp">No phase transitions in this period.</p>';
    return;
  }

  console.log("[breakpoints] Rendering", bpInRange.length, "cards");
  bpInRange.forEach(bp => {
    const from = phases.find(p => p.id === bp.from_id);
    const to   = phases.find(p => p.id === bp.to_id);
    console.log(
      `[breakpoints]   ${from?.name} → ${to?.name}`,
      `km: ${bp.changes?.km_per_week?.toFixed(0)}%`
    );
  });

  bpInRange.forEach(bp => {
    const fromPhase = phases.find(p => p.id === bp.from_id);
    const toPhase   = phases.find(p => p.id === bp.to_id);
    if (!fromPhase || !toPhase) return;

    const card = buildCard(bp, fromPhase, toPhase, meta);
    container.appendChild(card);
  });
}

// ─────────────────────────────────────────────────────────
// Public: highlightCard (called from zoomTimeline on diamond click)
// ─────────────────────────────────────────────────────────
export function highlightCard(fromId) {
  const card = document.getElementById(`bp-card-${fromId}`);
  if (!card) return;
  document.querySelectorAll(".bp-card.highlighted")
    .forEach(c => c.classList.remove("highlighted"));
  card.classList.add("highlighted");
  card.scrollIntoView({ behavior: "smooth", block: "nearest" });
  setTimeout(() => card.classList.remove("highlighted"), 2000);
}

// ─────────────────────────────────────────────────────────
// Build a single card element
// ─────────────────────────────────────────────────────────
function buildCard(bp, fromPhase, toPhase, meta) {
  const fromColor    = phaseColor(fromPhase.name);
  const toColor      = phaseColor(toPhase.name);
  const fromTextColor = phaseTextColor(fromPhase.name);
  const toTextColor   = phaseTextColor(toPhase.name);
  const changes = bp.changes || {};

  const card = document.createElement("div");
  card.className = "bp-card";
  card.id = `bp-card-${bp.from_id}`;

  // ── Header ──
  const header = document.createElement("div");
  header.className = "bp-header";
  header.innerHTML = `
    <div class="bp-from">
      <span class="bp-dot" style="background:${fromColor}"></span>
      <span class="bp-name" style="color:${fromTextColor}">${fromPhase.name}</span>
    </div>
    <span class="bp-arrow">→</span>
    <div class="bp-to">
      <span class="bp-dot" style="background:${toColor}"></span>
      <span class="bp-name" style="color:${toTextColor}">${toPhase.name}</span>
    </div>
    <span class="bp-week">W${bp.week_index + 1}</span>
  `;

  // ── Gradient divider ──
  const grad = document.createElement("div");
  grad.className = "bp-gradient";
  grad.style.background = `linear-gradient(90deg, ${fromColor}, ${toColor})`;

  // ── Metrics ──
  const metrics = document.createElement("div");
  metrics.className = "bp-metrics";

  const metricDefs = [
    { label: "km/wk",     value: changes.km_per_week,    bigger: true,  show: true },
    { label: "runs/wk",   value: changes.runs_per_week,  bigger: true,  show: true },
    { label: "pace",      value: changes.avg_pace,        bigger: false, show: true },
    { label: "structure", value: changes.long_run_ratio,  bigger: true,
      show: changes.long_run_ratio != null && Math.abs(changes.long_run_ratio) > 8 },
    { label: "efficiency", value: changes.efficiency,    bigger: true,
      show: meta?.has_hr === true && changes.efficiency != null && Math.abs(changes.efficiency) > 1 },
  ];

  metricDefs.forEach(m => {
    if (!m.show || m.value == null) return;
    metrics.appendChild(buildMetricRow(m.label, m.value, m.bigger, fromColor, toColor));
  });

  // ── Assemble ──
  card.appendChild(header);
  card.appendChild(grad);
  card.appendChild(metrics);

  // ── Interactions ──
  card.addEventListener("click", () => {
    const wasSelected = card.classList.contains("selected");
    document.querySelectorAll(".bp-card.selected").forEach(c => {
      c.classList.remove("selected");
      c.style.borderColor = "";
    });
    if (!wasSelected) {
      card.classList.add("selected");
      card.style.borderColor = toColor;
    }
  });

  return card;
}

// ─────────────────────────────────────────────────────────
// Build a single metric row with bar visualization
// ─────────────────────────────────────────────────────────
function buildMetricRow(label, value, biggerIsBetter, fromColor, toColor) {
  const row = document.createElement("div");
  row.className = "bp-metric-row";

  const beforeW = 40;
  const rawAfter = 40 * (1 + value / 100);
  const afterW = Math.max(4, Math.min(80, rawAfter));

  const deltaText  = pctLabel(value);
  const deltaColor = pctColor(value, biggerIsBetter);

  row.innerHTML = `
    <span class="bp-metric-label">${label}</span>
    <div class="bp-bars">
      <div class="bp-bar-before" style="width:${beforeW}px; background:${fromColor}"></div>
      <div class="bp-bar-after"  style="width:${afterW}px;  background:${toColor}"></div>
    </div>
    <span class="bp-delta" style="color:${deltaColor}">${deltaText}</span>
  `;

  return row;
}
