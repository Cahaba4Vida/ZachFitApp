const baseUrl = process.env.BASE_URL || "http://localhost:8888";
const authToken = process.env.AUTH_TOKEN || "";

const fetchJson = async (path, options = {}) => {
  const response = await fetch(`${baseUrl}${path}`, options);
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch (err) {
    data = { raw: text };
  }
  return { response, data };
};

const fail = (message) => {
  console.error(`✖ ${message}`);
  process.exit(1);
};

const pass = (message) => {
  console.log(`✔ ${message}`);
};

const run = async () => {
  const health = await fetchJson("/.netlify/functions/health");
  if (!health.response.ok) {
    fail(`Health endpoint HTTP ${health.response.status}`);
  }
  if (!health.data?.ok) {
    console.error("Health checks failed:", health.data?.checks);
    fail("Health checks did not pass");
  }
  pass("Health endpoint OK");

  if (!authToken) {
    fail("AUTH_TOKEN is required for authenticated smoke tests");
  }

  const authHeaders = {
    Authorization: `Bearer ${authToken}`,
    "Content-Type": "application/json",
  };

  const whoami = await fetchJson("/.netlify/functions/whoami", {
    headers: authHeaders,
  });
  if (!whoami.response.ok) {
    fail(`WhoAmI HTTP ${whoami.response.status}`);
  }
  pass("WhoAmI OK");

  const onboarding = {
    goal: "general",
    days: 3,
    experience: "beginner",
    equipment: "bodyweight",
    constraints: "",
    units: "lb",
  };
  const program = await fetchJson("/.netlify/functions/program-generate", {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({ onboarding }),
  });
  if (!program.response.ok) {
    fail(`Program generate HTTP ${program.response.status}`);
  }
  if (!program.data?.program?.weeks?.length) {
    fail("Program generate response missing program data");
  }
  pass("Program generate OK");
};

run().catch((err) => {
  console.error(err);
  fail("Smoke test failed");
});
