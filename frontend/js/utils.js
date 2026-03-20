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
