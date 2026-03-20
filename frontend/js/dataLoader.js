import APP_STATE from './state.js';

export async function loadData() {
  const resp = await fetch('data/phases.json');
  if (!resp.ok) throw new Error('Failed to load phases.json');
  const data = await resp.json();
  // Basic validation
  if (!data.phases || !data.weekly || !data.breakpoints || !data.meta) {
    throw new Error('phases.json missing required keys');
  }
  APP_STATE.phases = data.phases;
  APP_STATE.weekly = data.weekly;
  APP_STATE.breakpoints = data.breakpoints;
  APP_STATE.meta = data.meta;
}
