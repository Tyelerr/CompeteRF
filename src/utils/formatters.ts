/**
 * Format a date string to display format
 * @example "2025-01-21" -> "Tue, Jan 21"
 */
export function formatDate(dateString: string): string {
  const [y, m, d] = dateString.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

/**
 * Format a time string to 12-hour format
 * @example "14:30:00" -> "2:30 PM"
 */
export function formatTime(timeString: string): string {
  const [hours, minutes] = timeString.split(":");
  const hour = parseInt(hours);
  const ampm = hour >= 12 ? "PM" : "AM";
  const hour12 = hour % 12 || 12;
  return `${hour12}:${minutes} ${ampm}`;
}

/**
 * Format a currency amount
 * @example 0 -> "Free", 25 -> "$25"
 */
export function formatCurrency(amount: number): string {
  return amount === 0 ? "Free" : `$${amount}`;
}

/**
 * Format a date for display with year
 * @example "2025-01-21" -> "January 21, 2025"
 */
export function formatDateLong(dateString: string): string {
  const [y, m, d] = dateString.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

/**
 * Format a number with commas
 * @example 1000 -> "1,000"
 */
export function formatNumber(num: number): string {
  return num.toLocaleString();
}

/**
 * Format an elapsed duration (in ms) as strict zero-padded HH:MM:SS.
 * The single source of truth for every live/history Chip match timer
 * (Admin, spectator, and profile all render this so they stay identical).
 * @example 5000 -> "00:00:05", 222000 -> "00:03:42", 4509000 -> "01:15:09", 48958000 -> "13:35:58"
 */
export function formatElapsedClock(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

