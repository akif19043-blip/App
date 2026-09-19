/** Formatting helpers shared by every screen. */

export function formatCredits(value: number): string {
  return new Intl.NumberFormat('en-US').format(Math.round(value));
}

export function formatClock(totalSeconds: number): string {
  const clamped = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(clamped / 60);
  const seconds = clamped % 60;
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

export function formatDuration(totalSeconds: number): string {
  const clamped = Math.max(0, Math.floor(totalSeconds));
  if (clamped < 60) return `${clamped}s`;
  const minutes = Math.floor(clamped / 60);
  const seconds = clamped % 60;
  return seconds === 0 ? `${minutes}m` : `${minutes}m ${seconds}s`;
}

export function formatCompact(value: number): string {
  if (Math.abs(value) < 1000) return String(Math.round(value));
  return new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(
    value,
  );
}

export function titleCase(value: string): string {
  return value
    .split(/[\s_-]+/)
    .map((word) => (word ? word[0]!.toUpperCase() + word.slice(1) : ''))
    .join(' ');
}
