import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';

const supabaseUrl = 'https://fnbzfgmsamegbkeyhngn.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZuYnpmZ21zYW1lZ2JrZXlobmduIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg4Nzc3NDAsImV4cCI6MjA4NDQ1Mzc0MH0.EEM7RoJTUvzi5pW9LuEM90FhYlcbRWeIvyUdBadikXI';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});