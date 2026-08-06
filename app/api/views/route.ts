// View counter backed by a free hosted counter (abacus.jasoncameron.dev).
// Using a hosted counter means the total persists and works on serverless
// hosts like Vercel, where the local filesystem is read-only / ephemeral.

const COUNTER_URL = "https://abacus.jasoncameron.dev/hit/neuroscan-ai/home";

export async function GET() {
  try {
    const res = await fetch(COUNTER_URL, { cache: "no-store" });
    const data = (await res.json()) as { value?: number };
    return Response.json({ count: typeof data.value === "number" ? data.value : 0 });
  } catch {
    return Response.json({ count: 0 });
  }
}
