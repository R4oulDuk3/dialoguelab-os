import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

export const runtime = "nodejs";

export async function GET() {
  try {
    const javascript = await readFile(require.resolve("gsap/dist/gsap.min.js"));
    return new Response(javascript, { headers: { "content-type": "text/javascript; charset=utf-8", "cache-control": "public, max-age=31536000, immutable" } });
  } catch {
    return new Response("GSAP could not be loaded.", { status: 500 });
  }
}
