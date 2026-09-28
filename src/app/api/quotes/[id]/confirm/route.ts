import { NextRequest, NextResponse } from "next/server";
import { tenantFromRequest } from "@/features/quotes/server/session";
import { confirmDraft, isDatabaseUnavailable } from "@/features/quotes/server/repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "no-store" } as const;

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const tenant = await tenantFromRequest(req);
  if (!tenant) {
    return NextResponse.json({ error: "session required" }, { status: 401, headers: noStore });
  }
  const { id } = await params;

  let revision = Number.NaN;
  try {
    const body = (await req.json()) as { revision?: unknown };
    revision = Number(body.revision);
  } catch {
    revision = Number.NaN;
  }
  if (!Number.isInteger(revision) || revision < 1) {
    return NextResponse.json({ error: "revision required" }, { status: 400, headers: noStore });
  }

  try {
    const result = await confirmDraft(tenant.siteCode, id, revision);
    if (result.ok) {
      return NextResponse.json(
        { ok: true, version: result.version, versionId: result.versionId },
        { headers: noStore },
      );
    }
    if (result.reason === "conflict") {
      return NextResponse.json(
        {
          error: "conflict",
          message: "다른 화면에서 먼저 저장했습니다. 최신 내용을 불러온 뒤 다시 확정하세요.",
          current: result.current,
        },
        { status: 409, headers: noStore },
      );
    }
    if (result.reason === "invalid") {
      return NextResponse.json(
        {
          error: "invalid document",
          message: "확정할 수 없는 값이 있습니다. 오류를 수정한 뒤 다시 시도하세요.",
          validation: result.validation,
        },
        { status: 422, headers: noStore },
      );
    }
    return NextResponse.json({ error: "not found" }, { status: 404, headers: noStore });
  } catch (error) {
    if (isDatabaseUnavailable(error)) {
      return NextResponse.json(
        { error: "storage unavailable", message: "DATABASE_URL이 없어 확정할 수 없습니다." },
        { status: 503, headers: noStore },
      );
    }
    console.error("[quotes] confirm failed", { message: (error as Error).message });
    return NextResponse.json({ error: "confirm failed" }, { status: 500, headers: noStore });
  }
}
