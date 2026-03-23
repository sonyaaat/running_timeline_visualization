import { loadData } from "./dataLoader.js";
import APP_STATE from "./state.js";
import { renderOverview } from "../views/overview.js";
import { formatDate } from "./utils.js";

let pollInterval = null;

window.runPipeline = async function runPipeline() {
  const btn = document.getElementById("btn-sync");
  const statusEl = document.getElementById("sync-status");

  btn.disabled = true;
  btn.textContent = "⏳ Running...";
  statusEl.textContent = "Starting pipeline...";
  statusEl.style.color = "#6B7280";

  try {
    const res = await fetch("/api/run-pipeline", { method: "POST" });
    const data = await res.json();

    if (!data.started) {
      statusEl.textContent = "Already running, please wait...";
      btn.disabled = false;
      btn.textContent = "↻ Sync with Strava";
      return;
    }

    pollInterval = setInterval(async () => {
      const statusRes = await fetch("/api/status");
      const s = await statusRes.json();

      statusEl.textContent = s.message;

      if (s.done) {
        clearInterval(pollInterval);
        btn.disabled = false;
        btn.textContent = "↻ Sync with Strava";
        statusEl.style.color = "#3B6D11";
        statusEl.textContent = "✓ " + s.message;

        console.log("[main] Pipeline done — reloading data...");
        setTimeout(async () => {
          const newData = await loadData();
          APP_STATE.phases      = newData.phases;
          APP_STATE.weekly      = newData.weekly;
          APP_STATE.breakpoints = newData.breakpoints;
          APP_STATE.meta        = newData.meta;
          APP_STATE.zoomRange   = null;
          APP_STATE.hasZoom     = false;
          document.getElementById("section-detail").style.display = "none";
          renderOverview();
          console.log("[main] ✓ Data reloaded and UI updated");
        }, 500);
      }

      if (s.error) {
        clearInterval(pollInterval);
        btn.disabled = false;
        btn.textContent = "↻ Sync with Strava";
        statusEl.style.color = "#993C1D";
        statusEl.textContent = "✗ Error: " + s.error;
        console.error("[main] Pipeline error:", s.error);
      }
    }, 2000);

  } catch (err) {
    btn.disabled = false;
    btn.textContent = "↻ Sync with Strava";
    statusEl.style.color = "#993C1D";
    statusEl.textContent = "✗ Cannot connect to server";
    console.error("[main] Fetch error:", err);
  }
};

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

    // ── Back button — single button, always one step back ──
    const backBtn = document.getElementById("btn-go-back");

    function fadeHide(el, done) {
      el.style.transition = "opacity 0.3s ease";
      el.style.opacity = "0";
      setTimeout(() => {
        el.style.display = "none";
        el.style.opacity = "";
        el.style.transition = "";
        if (done) done();
      }, 310);
    }

    window.updateBackBtn = function() {
      const detailVisible = document.getElementById("section-detail")?.style.display !== "none";
      backBtn.style.display = detailVisible ? "flex" : "none";
    };

    const doReset = () => {
      const detail = document.getElementById("section-detail");
      fadeHide(detail, () => {
        APP_STATE.zoomRange = null;
        APP_STATE.hasZoom   = false;
        APP_STATE.selectedPhaseId = null;
        document.getElementById("heatmap-section").style.display      = "none";
        document.getElementById("bp-detail-panel").style.display      = "none";
        document.getElementById("week-detail-section").style.display  = "none";
        APP_STATE.selectedWeekIdx = null;
        renderOverview();
        updateBackBtn();
        setTimeout(() => document.getElementById("section-overview")?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
      });
    };

    backBtn.addEventListener("click", () => {
      const runPanel    = document.getElementById("wd-run-detail-panel");
      const weekSection = document.getElementById("week-detail-section");

      if (runPanel && runPanel.style.display !== "none") {
        // Level 3 → 2: close run detail
        fadeHide(runPanel, () => {
          document.querySelectorAll(".wd-run-block").forEach(b => b.classList.remove("wd-run-block--active"));
          setTimeout(() => document.getElementById("week-detail-content")?.scrollIntoView({ behavior: "smooth", block: "center" }), 50);
        });
      } else if (weekSection && weekSection.style.display !== "none") {
        // Level 2 → 1: close week detail
        fadeHide(weekSection, () => {
          APP_STATE.selectedWeekIdx = null;
          document.dispatchEvent(new CustomEvent("week-deselected"));
          setTimeout(() => document.getElementById("zoom-timeline-chart")?.scrollIntoView({ behavior: "smooth", block: "center" }), 50);
        });
      } else {
        // Level 1 → 0: close phase timeline
        doReset();
      }
    });

    document.getElementById("btn-reset").addEventListener("click", doReset);

    console.log("[main] ✓ App initialized");

  } catch (err) {
    document.getElementById("loading").innerHTML = `
      <div style="text-align:center;max-width:400px">
        <h2 style="font-size:18px;font-weight:500;margin-bottom:8px">
          Welcome to Running Phase Explorer
        </h2>
        <p style="color:#6B7280;font-size:14px;margin-bottom:20px">
          Click below to fetch your Strava data and detect training phases.
        </p>
        <button onclick="runPipeline()"
                style="padding:10px 24px;border-radius:8px;
                       background:#4F46E5;color:white;border:none;
                       font-size:14px;cursor:pointer">
          ↻ Fetch my Strava data
        </button>
        <p id="sync-status"
           style="margin-top:12px;font-size:12px;color:#6B7280">
        </p>
      </div>`;
    document.getElementById("loading").style.display = "flex";
    document.getElementById("app").style.display = "none";
    console.error("[main] Failed to initialize:", err);
  }
}

init();
