import { NextRequest, NextResponse } from "next/server";
import { tenantFromRequest } from "@/features/quotes/server/session";
import { duplicateDraft, isDatabaseUnavailable, listVersions } from "@/features/quotes/server/repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "no-store" } as const;

type Params = { params: Promise<{ id: string }> };

/** 확정 버전 목록. 확정본은 덮어쓰지 않고 여기에만 쌓인다. */
export async function GET(req: NextRequest, { params }: Params) {
  const tenant = await tenantFromRequest(req);
  if (!tenant) {
    return NextResponse.json({ error: "session required" }, { status: 401, headers: noStore });
  }
  const { id } = await params;
  try {
    const versions = await listVersions(tenant.siteCode, id);
    return NextResponse.json({ versions }, { headers: noStore });
  } catch (error) {
    if (isDatabaseUnavailable(error)) {
      return NextResponse.json(
        { error: "storage unavailable", message: "DATABASE_URL이 없어 버전을 읽을 수 없습니다." },
        { status: 503, headers: noStore },
      );
    }
    console.error("[quotes] versions failed", { message: (error as Error).message });
    return NextResponse.json({ error: "versions failed" }, { status: 500, headers: noStore });
  }
}

/** 이전 견적을 복제해 새 초안을 만든다. 확정 이력은 복사하지 않는다. */
export async function POST(req: NextRequest, { params }: Params) {
  const tenant = await tenantFromRequest(req);
  if (!tenant) {
    return NextResponse.json({ error: "session required" }, { status: 401, headers: noStore });
  }
  const { id } = await params;
  try {
    const draft = await duplicateDraft(tenant.siteCode, tenant.unitCode, id);
    if (!draft) {
      return NextResponse.json({ error: "not found" }, { status: 404, headers: noStore });
    }
    return NextResponse.json({ draft }, { status: 201, headers: noStore });
  } catch (error) {
    if (isDatabaseUnavailable(error)) {
      return NextResponse.json(
        { error: "storage unavailable", message: "DATABASE_URL이 없어 복제할 수 없습니다." },
        { status: 503, headers: noStore },
      );
    }
    console.error("[quotes] duplicate failed", { message: (error as Error).message });
    return NextResponse.json({ error: "duplicate failed" }, { status: 500, headers: noStore });
  }
}
