function parseVarsJson(json) {
  if (!json) return [];
  const vars = [];
  const parsed = JSON.parse(json);
  if (Array.isArray(parsed)) {
    parsed.forEach((item) => {
      if (!item) return;
      const key = item.key || item["key"];
      const value = item.value || item["value"];
      if (key) vars.push({ key: String(key), value: String(value), enabled: true });
    });
  } else if (parsed && typeof parsed === "object") {
    Object.entries(parsed).forEach(([ key, value ]) => {
      vars.push({ key: String(key), value: String(value), enabled: true });
    });
  }
  return vars;
}

function normalizeCollection(obj) {
  if (obj && obj.info && Array.isArray(obj.item)) return obj;
  return null;
}

function filterItemsByName(items, nameSet) {
  const out = [];
  items.forEach((it) => {
    if (Array.isArray(it.item)) {
      const children = filterItemsByName(it.item, nameSet);
      if (children.length) {
        out.push({ ...it, item: children });
      }
    } else {
      const name = it.name || "";
      if (nameSet.has(name)) out.push(it);
    }
  });
  return out;
}

function flattenRequests(items) {
  const names = [];
  items.forEach((it) => {
    if (Array.isArray(it.item)) {
      names.push(...flattenRequests(it.item));
    } else if (it.name) {
      names.push(it.name);
    }
  });
  return names;
}

module.exports = {
  parseVarsJson,
  normalizeCollection,
  filterItemsByName,
  flattenRequests
};
