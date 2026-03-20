import APP_STATE from './state.js';

export async function loadData() {
  const response = await fetch("data/phases.json");
  if (!response.ok) throw new Error(`Failed to load phases.json: ${response.status}`);
  const data = await response.json();

  if (!data.phases || !data.weekly || !data.breakpoints || !data.meta) {
    throw new Error("phases.json is missing required fields");
  }

  console.log(`[data] Loaded ${data.phases.length} phases, ${data.weekly.length} weeks`);
  console.log(`[data] Date range: ${data.meta.date_start} → ${data.meta.date_end}`);
  console.log(`[data] HR data: ${data.meta.has_hr}`);

  APP_STATE.phases      = data.phases;
  APP_STATE.weekly      = data.weekly;
  APP_STATE.breakpoints = data.breakpoints;
  APP_STATE.meta        = data.meta;

  return data;
}
