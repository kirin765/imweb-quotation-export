import { NextRequest, NextResponse } from "next/server";
import { tenantFromRequest } from "@/features/quotes/server/session";
import { isDatabaseUnavailable, getSupplier, saveSupplier } from "@/features/quotes/server/repo";
import { MAX_NAME_LENGTH, type SupplierInfo } from "@/features/quotes/model";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "no-store" } as const;

const FIELDS: (keyof SupplierInfo)[] = [
  "companyName",
  "businessNumber",
  "contactName",
  "contactPhone",
  "contactEmail",
  "address",
];

function parseSupplier(value: unknown): SupplierInfo | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }
  const raw = value as Record<string, unknown>;
  const supplier = {} as SupplierInfo;
  for (const field of FIELDS) {
    const text = raw[field];
    if (typeof text !== "string" || text.length > MAX_NAME_LENGTH) {
      return null;
    }
    supplier[field] = text;
  }
  return supplier;
}

export async function GET(req: NextRequest) {
  const tenant = await tenantFromRequest(req);
  if (!tenant) {
    return NextResponse.json({ error: "session required" }, { status: 401, headers: noStore });
  }
  try {
    return NextResponse.json({ supplier: await getSupplier(tenant.siteCode) }, { headers: noStore });
  } catch (error) {
    if (isDatabaseUnavailable(error)) {
      return NextResponse.json(
        { error: "storage unavailable", message: "DATABASE_URL이 없어 설정을 읽을 수 없습니다." },
        { status: 503, headers: noStore },
      );
    }
    console.error("[settings] get failed", { message: (error as Error).message });
    return NextResponse.json({ error: "get failed" }, { status: 500, headers: noStore });
  }
}

export async function PUT(req: NextRequest) {
  const tenant = await tenantFromRequest(req);
  if (!tenant) {
    return NextResponse.json({ error: "session required" }, { status: 401, headers: noStore });
  }
  let supplier: SupplierInfo | null = null;
  try {
    const body = (await req.json()) as { supplier?: unknown };
    supplier = parseSupplier(body.supplier);
  } catch {
    supplier = null;
  }
  if (!supplier) {
    return NextResponse.json({ error: "invalid supplier" }, { status: 400, headers: noStore });
  }
  try {
    await saveSupplier(tenant.siteCode, tenant.unitCode, supplier);
    return NextResponse.json({ ok: true, supplier }, { headers: noStore });
  } catch (error) {
    if (isDatabaseUnavailable(error)) {
      return NextResponse.json(
        { error: "storage unavailable", message: "DATABASE_URL이 없어 설정을 저장할 수 없습니다." },
        { status: 503, headers: noStore },
      );
    }
    console.error("[settings] save failed", { message: (error as Error).message });
    return NextResponse.json({ error: "save failed" }, { status: 500, headers: noStore });
  }
}
