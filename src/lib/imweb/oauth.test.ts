import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { exchangeCode, refreshAccessToken, authorizeUrl } from "./oauth";

const ENV = {
  IMWEB_CLIENT_ID: "cid-123",
  IMWEB_CLIENT_SECRET: "secret-456",
  IMWEB_REDIRECT_URI: "https://example.test/api/auth/callback",
};

const original = { ...process.env };

beforeEach(() => {
  process.env.IMWEB_CLIENT_ID = ENV.IMWEB_CLIENT_ID;
  process.env.IMWEB_CLIENT_SECRET = ENV.IMWEB_CLIENT_SECRET;
  process.env.IMWEB_REDIRECT_URI = ENV.IMWEB_REDIRECT_URI;
});

afterEach(() => {
  vi.unstubAllGlobals();
  for (const key of Object.keys(ENV)) {
    delete process.env[key];
  }
  Object.assign(process.env, original);
});

describe("아임웹 OAuth", () => {
  it("authorize URL은 camelCase query로 만든다", () => {
    const url = new URL(authorizeUrl("S2025012450f7813d2ddau", "state-1"));
    expect(url.origin + url.pathname).toBe("https://openapi.imweb.me/oauth2/authorize");
    expect(url.searchParams.get("responseType")).toBe("code");
    expect(url.searchParams.get("clientId")).toBe(ENV.IMWEB_CLIENT_ID);
    expect(url.searchParams.get("redirectUri")).toBe(ENV.IMWEB_REDIRECT_URI);
    expect(url.searchParams.get("state")).toBe("state-1");
    expect(url.searchParams.get("siteCode")).toBe("S2025012450f7813d2ddau");
    expect(url.searchParams.get("scope")).toContain("product:read");
  });

  it("토큰 요청은 form-urlencoded + Basic 인증으로 보낸다(JSON이면 30122로 거부됨)", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ statusCode: 200, data: { accessToken: "a", refreshToken: "r", scope: "s" } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const tokens = await exchangeCode("code-xyz");
    expect(tokens).toEqual({ accessToken: "a", refreshToken: "r", scope: "s" });

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://openapi.imweb.me/oauth2/token");
    expect(init.method).toBe("POST");
    const headers = init.headers as Record<string, string>;
    expect(headers["Content-Type"]).toBe("application/x-www-form-urlencoded");
    expect(headers.Authorization).toBe(
      `Basic ${Buffer.from(`${ENV.IMWEB_CLIENT_ID}:${ENV.IMWEB_CLIENT_SECRET}`).toString("base64")}`,
    );
    const body = new URLSearchParams(init.body as string);
    expect(body.get("grantType")).toBe("authorization_code");
    expect(body.get("clientId")).toBe(ENV.IMWEB_CLIENT_ID);
    expect(body.get("clientSecret")).toBe(ENV.IMWEB_CLIENT_SECRET);
    expect(body.get("redirectUri")).toBe(ENV.IMWEB_REDIRECT_URI);
    expect(body.get("code")).toBe("code-xyz");
    // JSON 문자열을 보내면 안 된다.
    expect(init.body as string).not.toContain("{");
  });

  it("갱신 요청은 grantType=refresh_token을 담는다", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ data: { accessToken: "a2", refreshToken: "r2" } }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const tokens = await refreshAccessToken("refresh-old");
    expect(tokens.accessToken).toBe("a2");
    const body = new URLSearchParams((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(body.get("grantType")).toBe("refresh_token");
    expect(body.get("refreshToken")).toBe("refresh-old");
  });

  it("실패 응답은 status를 실어 던진다", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ statusCode: 400 }), { status: 400 })),
    );
    await expect(exchangeCode("bad")).rejects.toMatchObject({ status: 400 });
  });

  it("accessToken/refreshToken이 없으면 명확히 실패한다", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ data: {} }), { status: 200 })));
    await expect(exchangeCode("x")).rejects.toThrow(/accessToken\/refreshToken/);
  });
});
