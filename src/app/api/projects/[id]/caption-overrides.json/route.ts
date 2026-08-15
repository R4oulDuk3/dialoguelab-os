export function GET() {
  return Response.json([], { headers: { "Cache-Control": "no-store" } });
}
