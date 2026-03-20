import APP_STATE from "../js/state.js";
import { phaseColor, phaseTextColor } from "../js/colors.js";
import { pctLabel, pctColor } from "../js/utils.js";

export function renderBreakpoints() {
  const container = document.getElementById("breakpoints-container");
  container.innerHTML = "";

  const { breakpoints, phases, zoomRange } = APP_STATE;
  if (!zoomRange || !breakpoints.length) {
    container.innerHTML = '<p class="no-data-msg">No transitions in this range.</p>';
    return;
  }

  const { weekStart, weekEnd } = zoomRange;

  // Filter breakpoints whose transition falls in the visible range
  const visBPs = breakpoints.filter(bp =>
    bp.week_index >= weekStart && bp.week_index <= weekEnd
  );

  if (!visBPs.length) {
    container.innerHTML = '<p class="no-data-msg">No phase transitions in this range.</p>';
    return;
  }

  visBPs.forEach(bp => {
    const fromPhase = phases.find(p => p.id === bp.from_id);
    const toPhase   = phases.find(p => p.id === bp.to_id);
    if (!fromPhase || !toPhase) return;

    const card = document.createElement("div");
    card.className = "bp-card";

    const changes = bp.changes || {};

    card.innerHTML = `
      <div class="bp-card-header">Transition · week ${bp.week_index}</div>
      <div class="bp-phases">
        <span class="bp-phase-chip" style="
          background:${phaseColor(fromPhase.name)};
          color:${phaseTextColor(fromPhase.name)}
        ">${fromPhase.name}</span>
        <span class="bp-arrow">→</span>
        <span class="bp-phase-chip" style="
          background:${phaseColor(toPhase.name)};
          color:${phaseTextColor(toPhase.name)}
        ">${toPhase.name}</span>
      </div>
      <div class="bp-changes">
        ${changeRow("km/wk",   changes.km_per_week,   true)}
        ${changeRow("runs/wk", changes.runs_per_week,  true)}
        ${changeRow("pace",    changes.avg_pace,        true)}
        ${changeRow("long run",changes.long_run_ratio,  true)}
        ${changes.efficiency != null ? changeRow("efficiency", changes.efficiency, true) : ""}
      </div>
    `;

    container.appendChild(card);
  });
}

function changeRow(key, value, biggerIsBetter) {
  if (value == null) return "";
  const label = pctLabel(value);
  const color = pctColor(value, biggerIsBetter);
  return `
    <div class="bp-change-row">
      <span class="bp-change-key">${key}</span>
      <span class="bp-change-val" style="color:${color}">${label}</span>
    </div>
  `;
}
