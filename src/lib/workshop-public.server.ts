import { createClient } from "@supabase/supabase-js";

/**
 * Server-only read of a workshop's public branding, for the manifest and icon
 * routes. Uses the publishable key, so only what RLS lets anyone read.
 */
export async function fetchWorkshopBranding(slug: string) {
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
  const supabase = createClient(process.env["SUPABASE_URL"]!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input: RequestInfo | URL, init?: RequestInit) => {
        const headers = new Headers(init?.headers);
        if (key.startsWith("sb_") && headers.get("Authorization") === `Bearer ${key}`) {
          headers.delete("Authorization");
        }
        headers.set("apikey", key);
        return fetch(input, { ...init, headers });
      },
    },
  });

  const { data } = await supabase.from("workshops").select("*").eq("slug", slug).maybeSingle();
  return data as {
    slug: string;
    name: string;
    brand_color: string;
    logo_url: string | null;
    icon_url?: string | null;
  } | null;
}

/** "SG Car Services" → "SC". */
export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter((word) => /^[A-Za-z0-9]/.test(word))
    .slice(0, 2)
    .map((word) => word[0]!.toUpperCase())
    .join("");
}

/**
 * Width and height of a PNG from its header, so the manifest can declare the
 * icon's real size (browsers reject icons whose declared size is wrong).
 * Returns null for anything that isn't a readable PNG.
 */
export async function pngSize(url: string): Promise<{ width: number; height: number } | null> {
  try {
    const response = await fetch(url, { headers: { range: "bytes=0-31" } });
    if (!response.ok) return null;
    const bytes = new Uint8Array(await response.arrayBuffer());
    const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    if (bytes.length < 24 || !signature.every((byte, i) => bytes[i] === byte)) return null;
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    return { width: view.getUint32(16), height: view.getUint32(20) };
  } catch {
    return null;
  }
}
