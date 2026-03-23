import APP_STATE from './state.js';

export async function loadData() {
  const response = await fetch("/api/data");
  if (!response.ok) throw new Error(`Failed to load data: ${response.status}`);
  const data = await response.json();

  if (!data.phases || !data.weekly || !data.breakpoints || !data.meta) {
    throw new Error("data is missing required fields");
  }

  console.log(`[data] Loaded ${data.phases.length} phases, ${data.weekly.length} weeks`);
  console.log(`[data] Date range: ${data.meta.date_start} → ${data.meta.date_end}`);
  console.log(`[data] HR data: ${data.meta.has_hr}`);

  APP_STATE.phases      = data.phases;
  APP_STATE.weekly      = data.weekly;
  APP_STATE.breakpoints = data.breakpoints;
  APP_STATE.meta        = data.meta;

  try {
    const actRes = await fetch("/api/activities");
    APP_STATE.activities = actRes.ok ? await actRes.json() : [];
  } catch (_) {
    APP_STATE.activities = [];
  }
  console.log(`[data] Loaded ${APP_STATE.activities.length} raw activities`);

  return data;
}
