import { loadData } from "./dataLoader.js";
import APP_STATE from "./state.js";
import { renderOverview } from "../views/overview.js";

let pollInterval = null;
let listenersAttached = false;

// ── Show the app after data is loaded ────────────────────────────────────────
function showApp(data) {
  document.getElementById("loading").style.display = "none";
  document.getElementById("app").style.display = "block";

  renderOverview();

  if (listenersAttached) return;
  listenersAttached = true;

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
      fadeHide(runPanel, () => {
        document.querySelectorAll(".wd-run-block").forEach(b => b.classList.remove("wd-run-block--active"));
        setTimeout(() => document.getElementById("week-detail-content")?.scrollIntoView({ behavior: "smooth", block: "center" }), 50);
      });
    } else if (weekSection && weekSection.style.display !== "none") {
      fadeHide(weekSection, () => {
        APP_STATE.selectedWeekIdx = null;
        document.dispatchEvent(new CustomEvent("week-deselected"));
        setTimeout(() => document.getElementById("zoom-timeline-chart")?.scrollIntoView({ behavior: "smooth", block: "center" }), 50);
      });
    } else {
      doReset();
    }
  });

  document.getElementById("btn-reset").addEventListener("click", doReset);
}

// ── Show loading progress message ─────────────────────────────────────────────
function showLoadingMessage(msg) {
  document.getElementById("loading").innerHTML = `
    <div style="text-align:center;max-width:400px">
      <p style="color:#6B7280;font-size:14px;margin-bottom:12px">${msg}</p>
      <p id="auto-sync-status" style="font-size:12px;color:#9CA3AF"></p>
    </div>`;
  document.getElementById("loading").style.display = "flex";
}

// ── Auto-run pipeline (first visit), poll until done, then show app ───────────
async function autoRunPipeline() {
  showLoadingMessage("Fetching your Strava data for the first time...");
  const statusEl = () => document.getElementById("auto-sync-status");

  try {
    const res = await fetch("/api/run-pipeline", { method: "POST" });
    const data = await res.json();
    if (!data.started) {
      showLoadingMessage("Starting...");
    }

    await new Promise((resolve, reject) => {
      pollInterval = setInterval(async () => {
        try {
          const s = await (await fetch("/api/status")).json();
          if (statusEl()) statusEl().textContent = s.message;

          if (s.done) {
            clearInterval(pollInterval);
            resolve();
          }
          if (s.error) {
            clearInterval(pollInterval);
            reject(new Error(s.error));
          }
        } catch (e) {
          clearInterval(pollInterval);
          reject(e);
        }
      }, 2000);
    });

    const newData = await loadData();
    showApp(newData);
    console.log("[main] ✓ Auto-pipeline done, app initialized");

  } catch (err) {
    document.getElementById("loading").innerHTML = `
      <div style="text-align:center;max-width:400px">
        <p style="color:#993C1D;font-size:14px">Error: ${err.message}</p>
        <button onclick="location.reload()"
                style="margin-top:16px;padding:8px 20px;border-radius:8px;
                       background:#4F46E5;color:white;border:none;font-size:14px;cursor:pointer">
          Try again
        </button>
      </div>`;
    document.getElementById("loading").style.display = "flex";
  }
}

// ── Sync button (manual re-sync) ──────────────────────────────────────────────
window.runPipeline = async function runPipeline() {
  const btn = document.getElementById("btn-sync");
  const statusEl = document.getElementById("sync-status");

  btn.disabled = true;
  btn.textContent = "⏳ Running...";
  statusEl.textContent = "Starting...";
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
      const s = await (await fetch("/api/status")).json();
      statusEl.textContent = s.message;

      if (s.done) {
        clearInterval(pollInterval);
        btn.disabled = false;
        btn.textContent = "↻ Sync with Strava";
        statusEl.style.color = "#3B6D11";
        statusEl.textContent = "✓ " + s.message;

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
        }, 500);
      }

      if (s.error) {
        clearInterval(pollInterval);
        btn.disabled = false;
        btn.textContent = "↻ Sync with Strava";
        statusEl.style.color = "#993C1D";
        statusEl.textContent = "✗ Error: " + s.error;
      }
    }, 2000);

  } catch (err) {
    btn.disabled = false;
    btn.textContent = "↻ Sync with Strava";
    statusEl.style.color = "#993C1D";
    statusEl.textContent = "✗ Cannot connect to server";
  }
};

// ── Init ──────────────────────────────────────────────────────────────────────
async function init() {
  console.log("[main] Starting Running Phase Explorer...");

  document.getElementById("loading").style.display = "flex";
  document.getElementById("app").style.display = "none";

  try {
    const meRes = await fetch("/api/me");
    if (meRes.ok) {
      const me = await meRes.json();
      const nameEl = document.getElementById("user-name");
      if (nameEl && me.name) nameEl.textContent = me.name;
    }
  } catch (_) {}

  try {
    const data = await loadData();
    showApp(data);
    console.log("[main] ✓ App initialized");
  } catch (err) {
    // No data yet — auto-fetch on first visit
    console.log("[main] No data found, auto-fetching from Strava...");
    await autoRunPipeline();
  }
}

window.showLogoutModal = function() {
  document.getElementById("logout-modal-overlay").style.display = "flex";
};

window.hideLogoutModal = function() {
  document.getElementById("logout-modal-overlay").style.display = "none";
};

init();
