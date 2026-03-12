const {
  parseVarsJson,
  normalizeCollection,
  filterItemsByName,
  flattenRequests
} = require("../../lib/newmanHelpers");

describe("newmanHelpers", () => {
  test("parseVarsJson handles object map", () => {
    const res = parseVarsJson("{\"ip\":\"1.2.3.4\",\"token\":\"abc\"}");
    expect(res).toEqual([
      { key: "ip", value: "1.2.3.4", enabled: true },
      { key: "token", value: "abc", enabled: true }
    ]);
  });

  test("parseVarsJson handles array", () => {
    const res = parseVarsJson("[{\"key\":\"a\",\"value\":1}]");
    expect(res).toEqual([ { key: "a", value: "1", enabled: true } ]);
  });

  test("normalizeCollection validates shape", () => {
    expect(normalizeCollection({ info: {}, item: [] })).not.toBeNull();
    expect(normalizeCollection({})).toBeNull();
  });

  test("filterItemsByName filters nested requests", () => {
    const items = [
      { name: "A", request: {} },
      { name: "Folder", item: [ { name: "B", request: {} } ] }
    ];
    const out = filterItemsByName(items, new Set([ "B" ]));
    expect(out).toEqual([ { name: "Folder", item: [ { name: "B", request: {} } ] } ]);
  });

  test("flattenRequests returns all request names", () => {
    const items = [
      { name: "A", request: {} },
      { name: "Folder", item: [ { name: "B", request: {} } ] }
    ];
    expect(flattenRequests(items)).toEqual([ "A", "B" ]);
  });
});
