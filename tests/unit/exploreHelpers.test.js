const {
  buildVarsMap,
  substituteVars,
  ensureAuthHeader,
  buildVariants,
  buildSchemaVariants,
  buildSecurityVariants,
  validateSchema,
  buildUrlWithQuery
} = require("../../lib/exploreHelpers");

describe("exploreHelpers", () => {
  test("buildVarsMap merges env/extra/ip/token", () => {
    const map = buildVarsMap({
      envVars: [ { key: "a", value: "1" } ],
      extraVars: [ { key: "b", value: "2" } ],
      ip: "127.0.0.1",
      token: "t"
    });
    expect(map).toEqual({ a: "1", b: "2", ip: "127.0.0.1", token: "t" });
  });

  test("substituteVars replaces tokens", () => {
    const out = substituteVars("http://{{ip}}/a?x={{token}}", { ip: "1.1.1.1", token: "abc" });
    expect(out).toBe("http://1.1.1.1/a?x=abc");
  });

  test("ensureAuthHeader adds bearer when missing", () => {
    const headers = ensureAuthHeader({ "X-Test": "1" }, "abc");
    expect(headers.Authorization).toBe("Bearer abc");
  });

  test("buildVariants uses query params first", () => {
    const variants = buildVariants({ queryParams: [ { key: "a", value: "1" } ], mode: "basic" }, 3);
    expect(variants[0].label).toMatch("query:remove");
    expect(variants[0].type).toBe("query");
  });

  test("buildVariants supports extended mode", () => {
    const variants = buildVariants(
      { bodyJson: { json: { name: "x" } }, mode: "extended" },
      10
    );
    expect(variants.some((v) => v.label.includes("sqli"))).toBe(true);
  });

  test("buildVariants supports custom mode", () => {
    const variants = buildVariants(
      { mode: "custom", customVariants: [ { label: "c1", body: { a: 1 } } ] },
      3
    );
    expect(variants[0].label).toBe("c1");
    expect(variants[0].type).toBe("custom");
  });

  test("buildSchemaVariants generates schema-based cases", () => {
    const schema = {
      type: "object",
      required: [ "name" ],
      properties: {
        name: { type: "string", minLength: 2, maxLength: 3 },
        role: { type: "string", enum: [ "admin", "user" ] },
        age: { type: "number", minimum: 1, maximum: 10 }
      }
    };
    const variants = buildSchemaVariants(schema, { name: "ok", role: "admin", age: 5 }, 10);
    expect(variants.some((v) => v.label.startsWith("schema:missing"))).toBe(true);
    expect(variants.some((v) => v.label.startsWith("schema:enum"))).toBe(true);
    expect(variants.some((v) => v.label.startsWith("schema:minLength"))).toBe(true);
    expect(variants.some((v) => v.label.startsWith("schema:maxLength"))).toBe(true);
    expect(variants.some((v) => v.label.startsWith("schema:minimum"))).toBe(true);
    expect(variants.some((v) => v.label.startsWith("schema:maximum"))).toBe(true);
  });

  test("buildSecurityVariants generates basic security cases", () => {
    const variants = buildSecurityVariants(
      { queryParams: [ { key: "q", value: "ok" } ] },
      2
    );
    expect(variants.length).toBe(2);
    expect(variants[0].label.startsWith("sec:query")).toBe(true);
  });

  test("validateSchema detects required/type/enum", () => {
    const schema = {
      type: "object",
      required: [ "id" ],
      properties: {
        id: { type: "integer" },
        status: { type: "string", enum: [ "ok" ] }
      }
    };
    const errors = validateSchema(schema, { id: "1", status: "bad" });
    expect(errors.some((e) => e.includes("$.id"))).toBe(true);
    expect(errors.some((e) => e.includes("$.status"))).toBe(true);
  });

  test("buildUrlWithQuery rewrites query", () => {
    const url = buildUrlWithQuery("http://example.com/a?x=1", [ { key: "y", value: "2" } ]);
    expect(url).toContain("y=2");
    expect(url).not.toContain("x=1");
  });
});
