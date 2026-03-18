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
    const first = queryParams[0];
    variants.push({
      label: `query:remove:${first.key}`,
      query: queryParams.slice(1),
      type: "query"
    });
    variants.push({
      label: `query:empty:${first.key}`,
      query: [ { key: first.key, value: "" }, ...queryParams.slice(1) ],
      type: "query"
    });
    if (mode === "extended") {
      variants.push({
        label: `query:long:${first.key}`,
        query: [ { key: first.key, value: "A".repeat(256) }, ...queryParams.slice(1) ],
        type: "query"
      });
      variants.push({
        label: `query:special:${first.key}`,
        query: [ { key: first.key, value: "' OR 1=1 --" }, ...queryParams.slice(1) ],
        type: "query"
      });
    }
  } else if (bodyJson && bodyJson.json && Object.keys(bodyJson.json).length) {
    const firstKey = Object.keys(bodyJson.json)[0];
    const base = bodyJson.json;
    const removed = { ...base };
    delete removed[firstKey];
    variants.push({ label: `body:remove:${firstKey}`, body: removed, type: "body" });

    variants.push({ label: `body:empty:${firstKey}`, body: { ...base, [firstKey]: "" }, type: "body" });
    variants.push({ label: `body:null:${firstKey}`, body: { ...base, [firstKey]: null }, type: "body" });

    const value = base[firstKey];
    let broken = value;
    if (typeof value === "string") broken = 123;
    else if (typeof value === "number") broken = String(value);
    else if (typeof value === "boolean") broken = String(value);
    variants.push({ label: `body:type:${firstKey}`, body: { ...base, [firstKey]: broken }, type: "body" });

    if (mode === "extended") {
      variants.push({ label: `body:long:${firstKey}`, body: { ...base, [firstKey]: "A".repeat(256) }, type: "body" });
      variants.push({ label: `body:special:${firstKey}`, body: { ...base, [firstKey]: "<script>alert(1)</script>" }, type: "body" });
      variants.push({ label: `body:sqli:${firstKey}`, body: { ...base, [firstKey]: "' OR 1=1 --" }, type: "body" });
    }
  }

  return variants.slice(0, maxVariants);
}

function buildSchemaVariants(schema, baseBody, maxVariants) {
  const variants = [];
  if (!schema || !baseBody || typeof baseBody !== "object" || Array.isArray(baseBody)) return variants;
  const required = Array.isArray(schema.required) ? schema.required : [];
  const properties = schema.properties || {};

  const requiredKey = required.find((k) => Object.prototype.hasOwnProperty.call(baseBody, k));
  if (requiredKey) {
    const removed = { ...baseBody };
    delete removed[requiredKey];
    variants.push({ label: `schema:missing:${requiredKey}`, body: removed, type: "schema" });
  }

  const enumKey = Object.keys(properties).find((k) => Array.isArray(properties[k]?.enum) && properties[k].enum.length);
  if (enumKey) {
    const invalid = "__invalid__";
    variants.push({ label: `schema:enum:${enumKey}`, body: { ...baseBody, [enumKey]: invalid }, type: "schema" });
  }

  const minKey = Object.keys(properties).find((k) => typeof properties[k]?.minLength === "number");
  if (minKey) {
    variants.push({ label: `schema:minLength:${minKey}`, body: { ...baseBody, [minKey]: "" }, type: "schema" });
  }

  const maxKey = Object.keys(properties).find((k) => typeof properties[k]?.maxLength === "number");
  if (maxKey) {
    const len = Math.min(2048, (properties[maxKey].maxLength || 0) + 1);
    variants.push({ label: `schema:maxLength:${maxKey}`, body: { ...baseBody, [maxKey]: "A".repeat(len) }, type: "schema" });
  }

  const minNumKey = Object.keys(properties).find((k) => typeof properties[k]?.minimum === "number");
  if (minNumKey) {
    variants.push({ label: `schema:minimum:${minNumKey}`, body: { ...baseBody, [minNumKey]: properties[minNumKey].minimum - 1 }, type: "schema" });
  }

  const maxNumKey = Object.keys(properties).find((k) => typeof properties[k]?.maximum === "number");
  if (maxNumKey) {
    variants.push({ label: `schema:maximum:${maxNumKey}`, body: { ...baseBody, [maxNumKey]: properties[maxNumKey].maximum + 1 }, type: "schema" });
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
  validateSchema,
  buildUrlWithQuery
};
