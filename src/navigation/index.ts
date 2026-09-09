// The app routes through expo-router (`app/`), not these navigators. The legacy
// React Navigation navigator files were removed in the Expo SDK 57 migration
// (they imported `@react-navigation/*` packages that are no longer installed).
// Only the shared navigation types remain.
export * from "./navigation.types";
