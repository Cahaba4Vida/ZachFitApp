const { requireAuth } = require("./_lib/auth");
const { getUserStore } = require("./_lib/store");
const {json, error, withErrorHandling } = require("./_lib/response");
const { parseBody, nowIso } = require("./_lib/utils");
const { validateSchema } = require("./_lib/schema");
const { generateProgram } = require("./_lib/program");

const createProgram = (inputs) => {
  const weeks = generateProgram(inputs);
  return {
    id: `program_${Date.now()}`,
    status: "draft",
    createdAt: nowIso(),
    updatedAt: nowIso(),
    weeks,
  };
};

exports.handler = withErrorHandling(async (event) => {
  const { user, error: authError } = requireAuth(event);
  if (authError) return authError;
  const body = parseBody(event);
  if (!body?.onboarding) return error(400, "Missing onboarding data");
  const { valid } = validateSchema("onboarding", body.onboarding);
  if (!valid) return error(400, "Invalid onboarding schema");
  const store = getUserStore(user.userId);
  const program = createProgram(body.onboarding);
  const { valid: programValid } = validateSchema("program", program);
  if (!programValid) return error(400, "Program schema invalid");
  const revisions = (await store.get("programRevisions")) || [];
  const nextRevisions = [program, ...revisions].slice(0, 10);
  await store.set("program", program);
  await store.set("programRevisions", nextRevisions);
  return json(200, program);
});
