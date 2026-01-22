const parseJsonBody = (event) => {
  if (!event.body) return null;
  try {
    return JSON.parse(event.body);
  } catch (error) {
    return null;
  }
};

module.exports = {
  parseJsonBody,
};
