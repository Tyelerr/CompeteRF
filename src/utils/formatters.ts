/**
 * Format a date string to display format
 * @example "2025-01-21" -> "Tue, Jan 21"
 */
export function formatDate(dateString: string): string {
  const date = new Date(dateString);
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
  const date = new Date(dateString);
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
