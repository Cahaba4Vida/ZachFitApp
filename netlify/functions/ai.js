const { requireAuth } = require("./_lib/auth");
const { getUserStore } = require("./_lib/store");
const { json, error, withErrorHandling } = require("./_lib/response");
const { parseBody, nowIso } = require("./_lib/utils");

const buildSystemPrompt = (mode) => {
  if (mode === "program_refine") {
    return "You are a strength coach. Provide a minimal JSON patch suggestion for program edits. Keep existing format.";
  }
  return "You are a training coach. Provide a minimal JSON update for today's workout. Keep existing format.";
};

exports.handler = withErrorHandling(async (event) => {
  const { user, error: authError } = await requireAuth(event);
  if (authError) return authError;
  const body = parseBody(event);
  if (!body?.mode || !body?.prompt) return error(400, "Missing mode or prompt");
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return error(500, "Missing OpenAI API key");
  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
  const system = buildSystemPrompt(body.mode);
  const payload = {
    model,
    messages: [
      { role: "system", content: system },
      {
        role: "user",
        content: `${body.prompt}\n\nContext:\n${JSON.stringify(
          body.mode === "program_refine" ? body.program : body.workout,
          null,
          2
        )}`,
      },
    ],
  };
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const detail = await response.text();
    return error(500, detail);
  }
  const data = await response.json();
  const message = data.choices?.[0]?.message?.content || "";
  if (body.mode === "today_adjust") {
    const store = getUserStore(user.userId);
    const revisions = (await store.get("todayAdjustRevisions")) || [];
    const entry = {
      createdAt: nowIso(),
      prompt: body.prompt,
      response: message,
    };
    await store.set("todayAdjustRevisions", [entry, ...revisions].slice(0, 10));
  }
  return json(200, { message });
});
