import { loadData } from "./dataLoader.js";
import APP_STATE from "./state.js";
import { renderOverview } from "../views/overview.js";
import { formatDate } from "./utils.js";

async function init() {
  console.log("[main] Starting Running Phase Explorer...");

  document.getElementById("loading").style.display = "flex";
  document.getElementById("app").style.display = "none";

  try {
    const data = await loadData();

    document.getElementById("loading").style.display = "none";
    document.getElementById("app").style.display = "block";

    // Populate header meta label
    const meta = data.meta;
    const runs = meta.total_runs ?? "?";
    const start = formatDate(meta.date_start);
    const end   = formatDate(meta.date_end);
    document.getElementById("meta-label").textContent =
      `${runs} runs · ${start} – ${end}`;

    // Render overview (always visible)
    renderOverview();

    // Wire up reset button
    document.getElementById("btn-reset").addEventListener("click", () => {
      APP_STATE.zoomRange = null;
      APP_STATE.hasZoom   = false;
      APP_STATE.selectedPhaseId = null;
      document.getElementById("section-detail").style.display = "none";
      document.getElementById("heatmap-section").style.display = "none";
      document.getElementById("eff-label").style.display = "none";
      // Re-render overview to clear brush
      renderOverview();
    });

    console.log("[main] ✓ App initialized");

  } catch (err) {
    document.getElementById("loading").innerHTML = `
      <div style="text-align:center;padding:40px">
        <p style="color:#993C1D;font-size:14px;margin-bottom:8px">
          Error loading data: ${err.message}
        </p>
        <p style="color:#888;font-size:12px">
          Make sure <code>data/phases.json</code> exists and run the backend pipeline first.
        </p>
      </div>`;
    console.error("[main] Failed to initialize:", err);
  }
}

init();
