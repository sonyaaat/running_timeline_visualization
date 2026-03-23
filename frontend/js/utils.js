export function formatPace(minPerKm) {
  if (!minPerKm || isNaN(minPerKm)) return "—";
  const min = Math.floor(minPerKm);
  const sec = Math.round((minPerKm - min) * 60);
  return `${min}:${sec.toString().padStart(2, "0")} /km`;
}

export function formatKm(km) {
  if (km == null || isNaN(km)) return "—";
  return `${km.toFixed(1)} km`;
}

export function formatWeekLabel(weekStr) {
  // "2023-01-02" or "2023-01-02/2023-01-08"
  if (!weekStr) return "";
  const dateStr = weekStr.includes("/") ? weekStr.split("/")[0] : weekStr;
  const d = new Date(dateStr + "T00:00:00");
  if (isNaN(d)) return weekStr;
  return d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

export function formatDate(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr + "T00:00:00");
  if (isNaN(d)) return dateStr;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function pctLabel(value) {
  if (value == null) return "";
  const sign = value >= 0 ? "↑" : "↓";
  return `${sign}${Math.abs(Math.round(value))}%`;
}

export function pctColor(value, biggerIsBetter = true) {
  if (value == null) return "#6B7280";
  const positive = biggerIsBetter ? value > 0 : value < 0;
  return positive ? "#3B6D11" : "#993C1D";
}

export function showTooltip(tooltip, event, html) {
  tooltip
    .style("display", "block")
    .style("left", "-9999px")
    .style("top", "-9999px")
    .html(html);

  const node = tooltip.node();
  const tw = node.offsetWidth;
  const th = node.offsetHeight;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const scrollX = window.scrollX || window.pageXOffset;
  const scrollY = window.scrollY || window.pageYOffset;

  const spaceRight = vw - (event.clientX + 12);
  const left = spaceRight >= tw
    ? event.pageX + 12
    : event.pageX - tw - 12;

  const spaceBelow = vh - (event.clientY - 28);
  const top = spaceBelow >= th
    ? event.pageY - 28
    : event.pageY - th + 28;

  tooltip
    .style("left", Math.max(scrollX, left) + "px")
    .style("top",  Math.max(scrollY, top) + "px");
}

export function moveTooltip(tooltip, event) {
  const node = tooltip.node();
  const tw = node.offsetWidth;
  const th = node.offsetHeight;
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  const left = (vw - (event.clientX + 12)) >= tw
    ? event.pageX + 12
    : event.pageX - tw - 12;

  const top = (vh - (event.clientY - 28)) >= th
    ? event.pageY - 28
    : event.pageY - th + 28;

  tooltip
    .style("left", Math.max(window.pageXOffset, left) + "px")
    .style("top",  Math.max(window.pageYOffset, top) + "px");
}

export function hideTooltip(tooltip) {
  tooltip.style("display", "none");
}
