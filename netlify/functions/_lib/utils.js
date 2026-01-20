const parseBody = (event) => {
  try {
    return event.body ? JSON.parse(event.body) : {};
  } catch (err) {
    return null;
  }
};

const nowIso = () => new Date().toISOString();

module.exports = { parseBody, nowIso };
