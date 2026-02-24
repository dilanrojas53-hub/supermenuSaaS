import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://zddytyncmnivfbvehrth.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpkZHl0eW5jbW5pdmZidmVocnRoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE5MTY1NDMsImV4cCI6MjA4NzQ5MjU0M30.aNQBiSsV-RXHze7D6LF4WGBwEdHyov-umuTh0t-Patk';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
