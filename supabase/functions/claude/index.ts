// Subli — Claude reasoning Edge Function.
//
// Holds CLAUDE_API_KEY as a Supabase secret (never shipped to the client or the
// Python backend). The backend POSTs { system, prompt } here; this function
// calls the Anthropic API and returns { text }.
//
// Deploy:
//   supabase functions deploy claude
//   supabase secrets set CLAUDE_API_KEY=sk-ant-...
// Optionally set the model:
//   supabase secrets set CLAUDE_MODEL=claude-3-5-sonnet-latest

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...cors },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  // Accept a few common secret names so a typo in the dashboard still works.
  const key =
    Deno.env.get("CLAUDE_API_KEY") ||
    Deno.env.get("Claud_Api") ||
    Deno.env.get("CLAUD_API") ||
    Deno.env.get("ANTHROPIC_API_KEY");
  if (!key) return json({ error: "Claude API key secret not configured" }, 500);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid JSON body" }, 400);
  }

  const model = body.model || Deno.env.get("CLAUDE_MODEL") || "claude-3-5-sonnet-latest";
  const payload = {
    model,
    max_tokens: body.max_tokens ?? 700,
    system: body.system ?? "",
    messages: [{ role: "user", content: String(body.prompt ?? "") }],
  };

  try {
    const r = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(payload),
    });
    const data = await r.json();
    if (!r.ok) return json({ error: data?.error?.message || "anthropic error" }, 502);
    const text = data?.content?.[0]?.text ?? "";
    return json({ text, model });
  } catch (e) {
    return json({ error: String(e) }, 502);
  }
});
