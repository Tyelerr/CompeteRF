import { Alert } from "react-native";

// Date formatting utilities
export const formatDate = (
  dateString: string,
  options?: Intl.DateTimeFormatOptions,
): string => {
  const defaultOptions: Intl.DateTimeFormatOptions = {
    year: "numeric",
    month: "short",
    day: "numeric",
  };

  return new Date(dateString).toLocaleDateString("en-US", {
    ...defaultOptions,
    ...options,
  });
};

export const formatDateTime = (dateString: string): string => {
  return new Date(dateString).toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

export const formatTimeAgo = (dateString: string): string => {
  const now = new Date();
  const date = new Date(dateString);
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  const intervals = [
    { label: "year", seconds: 31536000 },
    { label: "month", seconds: 2592000 },
    { label: "day", seconds: 86400 },
    { label: "hour", seconds: 3600 },
    { label: "minute", seconds: 60 },
  ];

  for (const interval of intervals) {
    const count = Math.floor(diffInSeconds / interval.seconds);
    if (count > 0) {
      return `${count} ${interval.label}${count !== 1 ? "s" : ""} ago`;
    }
  }

  return "Just now";
};

export const getDaysUntil = (dateString: string): string => {
  const now = new Date();
  const tournamentDate = new Date(dateString);
  const diffInMs = tournamentDate.getTime() - now.getTime();
  const diffInDays = Math.ceil(diffInMs / (1000 * 60 * 60 * 24));

  if (diffInDays < 0) {
    return "Past";
  } else if (diffInDays === 0) {
    return "Today";
  } else if (diffInDays === 1) {
    return "Tomorrow";
  } else {
    return `${diffInDays} days`;
  }
};

// Alert utilities for better UX
export const showConfirmationAlert = (
  title: string,
  message: string,
  onConfirm: () => void,
  confirmText: string = "Confirm",
  cancelText: string = "Cancel",
): void => {
  Alert.alert(title, message, [
    {
      text: cancelText,
      style: "cancel",
    },
    {
      text: confirmText,
      style: "destructive",
      onPress: onConfirm,
    },
  ]);
};

export const showSuccessAlert = (title: string, message: string): void => {
  Alert.alert(title, message, [{ text: "OK" }]);
};

export const showErrorAlert = (
  title: string = "Error",
  message: string,
): void => {
  Alert.alert(title, message, [{ text: "OK" }]);
};

// Tournament status utilities
export const getStatusColor = (status: string): string => {
  switch (status) {
    case "active":
      return "#22c55e"; // Green
    case "completed":
      return "#3b82f6"; // Blue
    case "archived":
      return "#6b7280"; // Gray
    case "cancelled":
      return "#ef4444"; // Red
    default:
      return "#6b7280";
  }
};

export const getStatusIcon = (status: string): string => {
  switch (status) {
    case "active":
      return "▶️";
    case "completed":
      return "✅";
    case "archived":
      return "📁";
    case "cancelled":
      return "❌";
    default:
      return "❓";
  }
};

// Format time string
export const formatTime = (timeString: string): string => {
  if (!timeString) return "";
  const [hours, minutes] = timeString.split(":");
  const hour = parseInt(hours, 10);
  const ampm = hour >= 12 ? "PM" : "AM";
  const hour12 = hour % 12 || 12;
  return `${hour12}:${minutes} ${ampm}`;
};
