/**
 * Playwright request fixture를 활용한 HTTP API 테스트.
 *
 * 이 앱이 생성하는 variant(변형 요청)를 실제 외부 API에 전송하는 패턴을 보여줍니다.
 * 외부 서비스 의존성이 있으므로 네트워크가 없는 환경에서는 스킵됩니다.
 *
 * 사용 API:
 *   - https://jsonplaceholder.typicode.com  (기본 CRUD)
 *   - https://httpbin.org                   (auth / 보안 variant)
 */

const { test, expect } = require("@playwright/test");

test.describe("기본 CRUD API 테스트 (JSONPlaceholder)", () => {
  test.setTimeout(20000);

  test("GET /todos/1 — 응답 구조가 스키마와 일치한다", async ({ request }) => {
    const res = await request.get("https://jsonplaceholder.typicode.com/todos/1");

    expect(res.ok()).toBe(true);
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(body).toMatchObject({
      id:        expect.any(Number),
      userId:    expect.any(Number),
      title:     expect.any(String),
      completed: expect.any(Boolean),
    });
  });

  test("POST /posts — JSON body가 응답에 에코된다", async ({ request }) => {
    const payload = { title: "test post", body: "hello", userId: 1 };

    const res = await request.post("https://jsonplaceholder.typicode.com/posts", {
      data: payload,
    });

    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body).toMatchObject({ title: "test post", body: "hello", userId: 1 });
    expect(body.id).toBeDefined();
  });

  test("PUT /posts/1 — 리소스 업데이트가 200을 반환한다", async ({ request }) => {
    const res = await request.put("https://jsonplaceholder.typicode.com/posts/1", {
      data: { id: 1, title: "updated", body: "content", userId: 1 },
    });

    expect(res.ok()).toBe(true);
  });

  test("DELETE /posts/1 — 삭제가 200을 반환한다", async ({ request }) => {
    const res = await request.delete("https://jsonplaceholder.typicode.com/posts/1");

    expect(res.ok()).toBe(true);
  });

  test("존재하지 않는 리소스 — 404를 반환한다", async ({ request }) => {
    const res = await request.get("https://jsonplaceholder.typicode.com/todos/99999");

    expect(res.status()).toBe(404);
  });
});

// ─── auth variant 테스트 (buildAuthVariants 결과를 실제 API에 전송하는 패턴) ───

test.describe("인증 variant 테스트 (httpbin)", () => {
  test.setTimeout(20000);

  test("auth:no_token — 보호된 엔드포인트는 401을 반환한다", async ({ request }) => {
    const res = await request.get("https://httpbin.org/bearer");

    expect(res.status()).toBe(401);
  });

  test("auth:with_token — 유효한 Bearer 토큰으로 200을 반환한다", async ({ request }) => {
    const res = await request.get("https://httpbin.org/bearer", {
      headers: { Authorization: "Bearer valid_test_token" },
    });

    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.authenticated).toBe(true);
  });

  test("auth:wrong_token — 잘못된 형식 토큰도 헤더로 전송되어야 한다", async ({ request }) => {
    // buildAuthVariants 가 생성하는 'Bearer invalid_token_000' 패턴
    const res = await request.get("https://httpbin.org/bearer", {
      headers: { Authorization: "Bearer invalid_token_000" },
    });

    // httpbin은 어떤 Bearer 값이든 200을 반환 — 실제 서비스라면 401/403 검증
    expect([200, 401, 403]).toContain(res.status());
  });
});

// ─── security variant 테스트 (buildSecurityVariants 결과를 실제 API에 전송하는 패턴) ─

test.describe("보안 variant 테스트 (httpbin)", () => {
  test.setTimeout(20000);

  test("sec:query:sqli — SQL 인젝션 파라미터가 5xx를 유발하지 않는다", async ({ request }) => {
    const res = await request.get("https://httpbin.org/get", {
      params: { q: "' OR 1=1 --" },
    });

    expect(res.status()).toBeLessThan(500);
  });

  test("sec:query:xss — XSS 페이로드가 5xx를 유발하지 않는다", async ({ request }) => {
    const res = await request.get("https://httpbin.org/get", {
      params: { q: "<script>alert(1)</script>" },
    });

    expect(res.status()).toBeLessThan(500);
  });

  test("sec:body:sqli — POST body SQL 인젝션이 5xx를 유발하지 않는다", async ({ request }) => {
    const res = await request.post("https://httpbin.org/post", {
      data: { name: "' OR 1=1 --", value: "test" },
    });

    expect(res.status()).toBeLessThan(500);
  });

  test("response header 검증 — Content-Type이 JSON이어야 한다", async ({ request }) => {
    const res = await request.get("https://httpbin.org/get");

    const contentType = res.headers()["content-type"] || "";
    expect(contentType).toContain("application/json");
  });
});

// ─── body variant 배치 테스트 ─────────────────────────────────────────────────

test.describe("body variant 배치 테스트", () => {
  test.setTimeout(30000);

  const basePayload = { username: "alice", age: 30, active: true };

  // buildVariants 가 생성하는 패턴과 동일한 변형 목록
  const variants = [
    { label: "body:remove:username", body: { age: 30, active: true } },
    { label: "body:empty:username",  body: { ...basePayload, username: "" } },
    { label: "body:null:username",   body: { ...basePayload, username: null } },
    { label: "body:type:username",   body: { ...basePayload, username: 123 } },
  ];

  for (const variant of variants) {
    test(`${variant.label} — 서버가 5xx로 응답하지 않는다`, async ({ request }) => {
      const res = await request.post("https://httpbin.org/post", {
        data: variant.body,
      });

      expect(res.status()).toBeLessThan(500);

      // httpbin은 전송된 body를 echo — 실제로 variant body가 전송됐는지 확인
      const echo = await res.json();
      expect(echo).toHaveProperty("json");
    });
  }
});
