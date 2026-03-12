const { URL } = require("url");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function truncateBody(value, limit = 5120) {
  if (value === null || value === undefined) return "";
  const text = typeof value === "string" ? value : JSON.stringify(value);
  if (text.length <= limit) return text;
  return text.slice(0, limit) + "...(truncated)";
}

function buildVarsMap({ envVars, extraVars, ip, token }) {
  const map = {};
  envVars.forEach((v) => {
    if (v && v.key) map[v.key] = v.value;
  });
  extraVars.forEach((v) => {
    if (v && v.key) map[v.key] = v.value;
  });
  if (ip) map.ip = ip;
  if (token) map.token = token;
  return map;
}

function substituteVars(text, vars) {
  if (!text) return text;
  return String(text).replace(/{{\s*([^}]+)\s*}}/g, (_m, key) => {
    if (Object.prototype.hasOwnProperty.call(vars, key)) return String(vars[key]);
    return "";
  });
}

function ensureAuthHeader(headers, token) {
  if (!token) return headers;
  const hasAuth = Object.keys(headers).some((k) => k.toLowerCase() === "authorization");
  if (hasAuth) return headers;
  const value = token.startsWith("Bearer ") ? token : `Bearer ${token}`;
  return { ...headers, Authorization: value };
}

function normalizeHeaderArray(arr, vars) {
  const headers = {};
  if (!Array.isArray(arr)) return headers;
  arr.forEach((h) => {
    if (!h || !h.key) return;
    const value = substituteVars(h.value || "", vars);
    headers[h.key] = value;
  });
  return headers;
}

function buildUrl(raw, vars, ip) {
  const substituted = substituteVars(raw || "", vars);
  if (!substituted) return "";
  if (/^https?:\/\//i.test(substituted)) return substituted;
  if (substituted.startsWith("//")) return `http:${substituted}`;
  if (substituted.startsWith("/") && ip) return `http://${ip}${substituted}`;
  if (ip) return `http://${ip}/${substituted}`;
  return substituted;
}

function getRequestUrl(req, vars, ip) {
  if (!req || !req.url) return "";
  if (typeof req.url === "string") return buildUrl(req.url, vars, ip);
  if (req.url.raw) return buildUrl(req.url.raw, vars, ip);
  const protocol = req.url.protocol ? `${req.url.protocol}://` : "";
  const host = Array.isArray(req.url.host) ? req.url.host.join(".") : req.url.host || "";
  const path = Array.isArray(req.url.path) ? req.url.path.join("/") : req.url.path || "";
  const base = `${protocol}${host}${path ? "/" + path : ""}`;
  return buildUrl(base, vars, ip);
}

function getQueryParams(req, vars) {
  if (!req || !req.url || !req.url.query) return [];
  return req.url.query.map((q) => ({
    key: q.key,
    value: substituteVars(q.value || "", vars)
  }));
}

function getJsonBody(req, vars) {
  if (!req || !req.body || req.body.mode !== "raw") return null;
  const raw = substituteVars(req.body.raw || "", vars);
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return { raw, json: parsed };
    }
  } catch {
    return { raw, json: null };
  }
  return { raw, json: null };
}

function buildVariants({ queryParams, bodyJson }, maxVariants) {
  const variants = [];
  if (queryParams && queryParams.length) {
    const first = queryParams[0];
    variants.push({
      label: `query:remove:${first.key}`,
      query: queryParams.slice(1)
    });
    variants.push({
      label: `query:empty:${first.key}`,
      query: [ { key: first.key, value: "" }, ...queryParams.slice(1) ]
    });
  } else if (bodyJson && bodyJson.json && Object.keys(bodyJson.json).length) {
    const firstKey = Object.keys(bodyJson.json)[0];
    const base = bodyJson.json;
    const removed = { ...base };
    delete removed[firstKey];
    variants.push({ label: `body:remove:${firstKey}`, body: removed });

    variants.push({ label: `body:empty:${firstKey}`, body: { ...base, [firstKey]: "" } });
    variants.push({ label: `body:null:${firstKey}`, body: { ...base, [firstKey]: null } });

    const value = base[firstKey];
    let broken = value;
    if (typeof value === "string") broken = 123;
    else if (typeof value === "number") broken = String(value);
    else if (typeof value === "boolean") broken = String(value);
    variants.push({ label: `body:type:${firstKey}`, body: { ...base, [firstKey]: broken } });
  }

  return variants.slice(0, maxVariants);
}

function buildUrlWithQuery(urlRaw, queryParams) {
  if (!urlRaw) return urlRaw;
  try {
    const url = new URL(urlRaw);
    url.search = "";
    if (Array.isArray(queryParams)) {
      queryParams.forEach((q) => {
        if (!q || !q.key) return;
        url.searchParams.append(q.key, q.value ?? "");
      });
    }
    return url.toString();
  } catch {
    return urlRaw;
  }
}

module.exports = {
  sleep,
  truncateBody,
  buildVarsMap,
  substituteVars,
  ensureAuthHeader,
  normalizeHeaderArray,
  getRequestUrl,
  getQueryParams,
  getJsonBody,
  buildVariants,
  buildUrlWithQuery
};
