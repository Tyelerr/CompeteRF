import {
  QueryClient,
  QueryClientProvider,
  focusManager,
} from '@tanstack/react-query';
import { ReactNode, useEffect } from 'react';
import { AppState, AppStateStatus, Platform } from 'react-native';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      retry: 1,
    },
  },
});

interface QueryProviderProps {
  children: ReactNode;
}

export const QueryProvider = ({ children }: QueryProviderProps) => {
  // React Query's `refetchOnWindowFocus` (and the pause-when-unfocused behavior of
  // `refetchInterval`) rely on a focus signal. On the web that comes from the DOM;
  // on React Native there is no `window` focus event, so without this wiring
  // `refetchOnWindowFocus: true` is a NO-OP — queries never revalidate when the app
  // returns to the foreground. Bridging AppState → focusManager makes every hook
  // that opts into focus refetching (Profile live-tournament check, live match, chip,
  // reviews, …) revalidate on resume, and lets interval polling correctly pause in
  // the background. Web keeps its native DOM focus handling.
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const onChange = (state: AppStateStatus) => {
      focusManager.setFocused(state === 'active');
    };
    const sub = AppState.addEventListener('change', onChange);
    return () => sub.remove();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
};
