import { afterEach, describe, expect, it } from "vitest";
import { issueSession, sessionFromValue } from "./session";

const original = process.env.IMWEB_SESSION_SECRET;

afterEach(() => {
  if (original === undefined) {
    delete process.env.IMWEB_SESSION_SECRET;
  } else {
    process.env.IMWEB_SESSION_SECRET = original;
  }
});

describe("세션 쿠키", () => {
  it("서명한 세션에서 siteCode를 돌려준다", () => {
    process.env.IMWEB_SESSION_SECRET = "unit-test-secret";
    const value = issueSession("S2025012450f7813d2ddau");
    expect(sessionFromValue(value)).toBe("S2025012450f7813d2ddau");
  });

  it("변조한 payload와 서명은 거부한다", () => {
    process.env.IMWEB_SESSION_SECRET = "unit-test-secret";
    const value = issueSession("S2025012450f7813d2ddau");
    const [payload, sig] = value.split(".");
    const forged = Buffer.from(
      JSON.stringify({ siteCode: "S-other", exp: Date.now() + 100000 }),
    ).toString("base64url");
    expect(sessionFromValue(`${forged}.${sig}`)).toBeNull();
    expect(sessionFromValue(`${payload}.tampered`)).toBeNull();
    expect(sessionFromValue(undefined)).toBeNull();
    expect(sessionFromValue("garbage")).toBeNull();
  });

  it("다른 시크릿으로 서명하면 거부한다", () => {
    process.env.IMWEB_SESSION_SECRET = "secret-a";
    const value = issueSession("S2025012450f7813d2ddau");
    process.env.IMWEB_SESSION_SECRET = "secret-b";
    expect(sessionFromValue(value)).toBeNull();
  });
});
