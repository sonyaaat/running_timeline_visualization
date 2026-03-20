import APP_STATE from './state.js';
import { loadData } from './dataLoader.js';
import { renderOverview } from '../views/overview.js';
import { renderZoomTimeline } from '../views/zoomTimeline.js';
import { renderBreakpoints } from '../views/breakpoints.js';
import { renderHeatmap } from '../views/heatmap.js';
import { renderEfficiency } from '../views/efficiency.js';

async function init() {
  await loadData();
  renderOverview();
  renderZoomTimeline();
  renderBreakpoints();
  renderHeatmap();
  renderEfficiency();
}

document.addEventListener('DOMContentLoaded', init);
