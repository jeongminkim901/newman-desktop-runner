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

function buildVariants({ queryParams, bodyJson, mode, customVariants }, maxVariants) {
  const variants = [];
  if (mode === "custom" && Array.isArray(customVariants)) {
    customVariants.forEach((v) => {
      if (!v || !v.label) return;
      if (v.query) variants.push({ label: v.label, query: v.query, type: "custom" });
      else if (v.body) variants.push({ label: v.label, body: v.body, type: "custom" });
    });
    return variants.slice(0, maxVariants);
  }

  if (queryParams && queryParams.length) {
    for (const param of queryParams) {
      const { key } = param;
      const others = queryParams.filter((q) => q.key !== key);
      variants.push({ label: `query:remove:${key}`, query: others, type: "query" });
      variants.push({ label: `query:empty:${key}`, query: [ { key, value: "" }, ...others ], type: "query" });
      if (mode === "extended") {
        variants.push({ label: `query:long:${key}`, query: [ { key, value: "A".repeat(256) }, ...others ], type: "query" });
        variants.push({ label: `query:special:${key}`, query: [ { key, value: "' OR 1=1 --" }, ...others ], type: "query" });
      }
    }
  } else if (bodyJson && bodyJson.json && Object.keys(bodyJson.json).length) {
    const base = bodyJson.json;
    for (const key of Object.keys(base)) {
      const removed = { ...base };
      delete removed[key];
      variants.push({ label: `body:remove:${key}`, body: removed, type: "body" });
      variants.push({ label: `body:empty:${key}`, body: { ...base, [key]: "" }, type: "body" });
      variants.push({ label: `body:null:${key}`, body: { ...base, [key]: null }, type: "body" });
      const value = base[key];
      let broken = value;
      if (typeof value === "string") broken = 123;
      else if (typeof value === "number") broken = String(value);
      else if (typeof value === "boolean") broken = String(value);
      variants.push({ label: `body:type:${key}`, body: { ...base, [key]: broken }, type: "body" });
      if (mode === "extended") {
        variants.push({ label: `body:long:${key}`, body: { ...base, [key]: "A".repeat(256) }, type: "body" });
        variants.push({ label: `body:special:${key}`, body: { ...base, [key]: "<script>alert(1)</script>" }, type: "body" });
        variants.push({ label: `body:sqli:${key}`, body: { ...base, [key]: "' OR 1=1 --" }, type: "body" });
      }
    }
  }

  return variants.slice(0, maxVariants);
}

function buildSchemaVariants(schema, baseBody, maxVariants) {
  const variants = [];
  if (!schema || !baseBody || typeof baseBody !== "object" || Array.isArray(baseBody)) return variants;
  const required = Array.isArray(schema.required) ? schema.required : [];
  const properties = schema.properties || {};

  for (const k of required) {
    if (Object.prototype.hasOwnProperty.call(baseBody, k)) {
      const removed = { ...baseBody };
      delete removed[k];
      variants.push({ label: `schema:missing:${k}`, body: removed, type: "schema" });
    }
  }

  for (const [ k, prop ] of Object.entries(properties)) {
    if (Array.isArray(prop?.enum) && prop.enum.length) {
      variants.push({ label: `schema:enum:${k}`, body: { ...baseBody, [k]: "__invalid__" }, type: "schema" });
    }
  }

  for (const [ k, prop ] of Object.entries(properties)) {
    if (typeof prop?.minLength === "number") {
      variants.push({ label: `schema:minLength:${k}`, body: { ...baseBody, [k]: "" }, type: "schema" });
    }
  }

  for (const [ k, prop ] of Object.entries(properties)) {
    if (typeof prop?.maxLength === "number") {
      const len = Math.min(2048, (prop.maxLength || 0) + 1);
      variants.push({ label: `schema:maxLength:${k}`, body: { ...baseBody, [k]: "A".repeat(len) }, type: "schema" });
    }
  }

  for (const [ k, prop ] of Object.entries(properties)) {
    if (typeof prop?.minimum === "number") {
      variants.push({ label: `schema:minimum:${k}`, body: { ...baseBody, [k]: prop.minimum - 1 }, type: "schema" });
    }
  }

  for (const [ k, prop ] of Object.entries(properties)) {
    if (typeof prop?.maximum === "number") {
      variants.push({ label: `schema:maximum:${k}`, body: { ...baseBody, [k]: prop.maximum + 1 }, type: "schema" });
    }
  }

  return variants.slice(0, maxVariants);
}

function buildSecurityVariants({ queryParams, bodyJson, schema, mode = "basic" }, maxVariants) {
  const variants = [];
  if (queryParams && queryParams.length) {
    const first = queryParams[0];
    variants.push({
      label: `sec:query:sqli:${first.key}`,
      query: [ { key: first.key, value: "' OR 1=1 --" }, ...queryParams.slice(1) ],
      type: "security"
    });
    variants.push({
      label: `sec:query:xss:${first.key}`,
      query: [ { key: first.key, value: "<script>alert(1)</script>" }, ...queryParams.slice(1) ],
      type: "security"
    });
    if (mode === "hard") {
      variants.push({
        label: `sec:query:path:${first.key}`,
        query: [ { key: first.key, value: "../../etc/passwd" }, ...queryParams.slice(1) ],
        type: "security"
      });
      variants.push({
        label: `sec:query:long:${first.key}`,
        query: [ { key: first.key, value: "A".repeat(512) }, ...queryParams.slice(1) ],
        type: "security"
      });
    }
  } else if (bodyJson && bodyJson.json && typeof bodyJson.json === "object" && !Array.isArray(bodyJson.json)) {
    const props = schema?.properties || {};
    const keys = Object.keys(bodyJson.json);
    const targetKey = keys.find((k) => props[k]?.type === "string") || keys.find((k) => typeof bodyJson.json[k] === "string");
    if (targetKey) {
      variants.push({
        label: `sec:body:sqli:${targetKey}`,
        body: { ...bodyJson.json, [targetKey]: "' OR 1=1 --" },
        type: "security"
      });
      variants.push({
        label: `sec:body:xss:${targetKey}`,
        body: { ...bodyJson.json, [targetKey]: "<script>alert(1)</script>" },
        type: "security"
      });
      if (mode === "hard") {
        variants.push({
          label: `sec:body:path:${targetKey}`,
          body: { ...bodyJson.json, [targetKey]: "../..//etc/passwd" },
          type: "security"
        });
        variants.push({
          label: `sec:body:long:${targetKey}`,
          body: { ...bodyJson.json, [targetKey]: "A".repeat(512) },
          type: "security"
        });
      }
    }
  }
  return variants.slice(0, maxVariants);
}

function validateSchema(schema, data, path = "$") {
  const errors = [];
  if (!schema) return errors;

  const type = schema.type;
  if (type) {
    const ok =
      (type === "object" && data && typeof data === "object" && !Array.isArray(data)) ||
      (type === "array" && Array.isArray(data)) ||
      (type === "string" && typeof data === "string") ||
      (type === "number" && typeof data === "number") ||
      (type === "integer" && Number.isInteger(data)) ||
      (type === "boolean" && typeof data === "boolean") ||
      (type === "null" && data === null);
    if (!ok) {
      errors.push(`${path}: type`);
      return errors;
    }
  }

  if (Array.isArray(schema.enum)) {
    if (!schema.enum.includes(data)) errors.push(`${path}: enum`);
  }

  if (typeof schema.minLength === "number" && typeof data === "string") {
    if (data.length < schema.minLength) errors.push(`${path}: minLength`);
  }
  if (typeof schema.maxLength === "number" && typeof data === "string") {
    if (data.length > schema.maxLength) errors.push(`${path}: maxLength`);
  }
  if (typeof schema.minimum === "number" && typeof data === "number") {
    if (data < schema.minimum) errors.push(`${path}: minimum`);
  }
  if (typeof schema.maximum === "number" && typeof data === "number") {
    if (data > schema.maximum) errors.push(`${path}: maximum`);
  }

  if (schema.type === "object" && schema.properties && data && typeof data === "object" && !Array.isArray(data)) {
    const required = Array.isArray(schema.required) ? schema.required : [];
    required.forEach((k) => {
      if (!Object.prototype.hasOwnProperty.call(data, k)) errors.push(`${path}.${k}: required`);
    });
    Object.entries(schema.properties).forEach(([k, sub]) => {
      if (Object.prototype.hasOwnProperty.call(data, k)) {
        errors.push(...validateSchema(sub, data[k], `${path}.${k}`));
      }
    });
  }

  if (schema.type === "array" && schema.items && Array.isArray(data)) {
    data.forEach((item, idx) => {
      errors.push(...validateSchema(schema.items, item, `${path}[${idx}]`));
    });
  }

  return errors;
}

function buildAuthVariants(token, maxVariants) {
  const variants = [];
  variants.push({ label: "auth:no_token", authOverride: "none", type: "auth" });
  if (token) {
    variants.push({ label: "auth:wrong_token", authOverride: "Bearer invalid_token_000", type: "auth" });
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
  buildSchemaVariants,
  buildSecurityVariants,
  buildAuthVariants,
  validateSchema,
  buildUrlWithQuery
};
