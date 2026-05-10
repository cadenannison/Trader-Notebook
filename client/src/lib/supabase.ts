import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

// Client is created even with empty strings so imports don't throw.
// Auth features are simply inoperative until the env vars are set.
export const supabase = createClient(supabaseUrl, supabaseAnonKey);
