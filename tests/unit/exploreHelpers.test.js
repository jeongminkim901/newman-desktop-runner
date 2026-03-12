const {
  buildVarsMap,
  substituteVars,
  ensureAuthHeader,
  buildVariants,
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
    const variants = buildVariants({ queryParams: [ { key: "a", value: "1" } ] }, 3);
    expect(variants[0].label).toMatch("query:remove");
  });

  test("buildUrlWithQuery rewrites query", () => {
    const url = buildUrlWithQuery("http://example.com/a?x=1", [ { key: "y", value: "2" } ]);
    expect(url).toContain("y=2");
    expect(url).not.toContain("x=1");
  });
});
