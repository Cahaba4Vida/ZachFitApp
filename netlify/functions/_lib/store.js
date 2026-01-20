const { getStore } = require("@netlify/blobs");

const getUserStore = (userId) => {
  const store = getStore("zachfitapp");
  return {
    get: async (key) => store.get(`${userId}/${key}`, { type: "json" }),
    set: async (key, value) => store.set(`${userId}/${key}`, JSON.stringify(value)),
    delete: async (key) => store.delete(`${userId}/${key}`),
    list: async (prefix) => store.list({ prefix: `${userId}/${prefix}` }),
  };
};

const getGlobalStore = () => {
  const store = getStore("zachfitapp");
  return {
    get: async (key) => store.get(`global/${key}`, { type: "json" }),
    set: async (key, value) => store.set(`global/${key}`, JSON.stringify(value)),
    list: async (prefix) => store.list({ prefix: `global/${prefix}` }),
  };
};

module.exports = { getUserStore, getGlobalStore };
