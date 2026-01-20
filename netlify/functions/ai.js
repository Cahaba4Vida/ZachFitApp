const { requireAuth } = require("./_lib/auth");
const { getUserStore } = require("./_lib/store");
const { json, error } = require("./_lib/response");
const { parseBody, nowIso } = require("./_lib/utils");

const buildSystemPrompt = (mode) => {
  if (mode === "program_refine") {
    return "You are a strength coach. Provide a minimal JSON patch suggestion for program edits. Keep existing format.";
  }
  if (mode === "program_import") {
    return "You extract onboarding inputs from files. Return JSON only with keys: goal, days, experience, equipment, constraints, benchPr, squatPr, deadliftPr, units.";
  }
  return "You are a training coach. Provide a minimal JSON update for today's workout. Keep existing format.";
};

exports.handler = async (event) => {
  const { user, error: authError } = requireAuth(event);
  if (authError) return authError;
  const body = parseBody(event);
  if (!body?.mode || !body?.prompt) return error(400, "Missing mode or prompt");
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return error(500, "Missing OpenAI API key");
  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
  const system = buildSystemPrompt(body.mode);
  const buildUserMessage = () => {
    if (body.mode === "program_import") {
      if (body.fileType?.startsWith("image/") && body.fileContent) {
        return {
          role: "user",
          content: [
            { type: "text", text: body.prompt },
            { type: "image_url", image_url: { url: body.fileContent } },
          ],
        };
      }
      return {
        role: "user",
        content: `${body.prompt}\n\nFile content:\n${body.fileContent || ""}`,
      };
    }
    return {
      role: "user",
      content: `${body.prompt}\n\nContext:\n${JSON.stringify(
        body.mode === "program_refine" ? body.program : body.workout,
        null,
        2
      )}`,
    };
  };
  const payload = {
    model,
    messages: [{ role: "system", content: system }, buildUserMessage()],
    temperature: 0.2,
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
};
