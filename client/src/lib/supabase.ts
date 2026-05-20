import { createClient } from "@supabase/supabase-js";

// Fall back to a syntactically valid placeholder so createClient doesn't throw
// during Next.js static generation when env vars aren't injected yet.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://placeholder.supabase.co";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "placeholder";

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
