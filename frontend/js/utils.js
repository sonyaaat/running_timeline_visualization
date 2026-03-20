// Shared formatting helpers
export function formatPace(pace) {
  if (pace == null) return '--';
  const min = Math.floor(pace);
  const sec = Math.round((pace - min) * 60).toString().padStart(2, '0');
  return `${min}:${sec}/km`;
}

export function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString();
}

export function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}

// Format week label as 'Jan 2023', bold if January
export function formatWeekLabel(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const month = d.toLocaleString('default', { month: 'short' });
  const year = d.getFullYear();
  return `${month} ${year}`;
}
