import { NextRequest, NextResponse } from "next/server";
import { tenantFromRequest } from "@/features/quotes/server/session";
import { MAX_ITEMS, validateDocument, type QuoteDocument } from "@/features/quotes/model";
import {
  deleteDraft,
  getDraft,
  isDatabaseUnavailable,
  listAuditEvents,
  listVersions,
  recordExport,
  saveDraft,
} from "@/features/quotes/server/repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "no-store" } as const;

type Params = { params: Promise<{ id: string }> };

function parseDocument(value: unknown): QuoteDocument | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }
  const candidate = value as Partial<QuoteDocument>;
  if (
    typeof candidate.documentNumber !== "string" ||
    typeof candidate.recipientCompany !== "string" ||
    !Array.isArray(candidate.items) ||
    candidate.items.length === 0 ||
    candidate.items.length > MAX_ITEMS
  ) {
    return null;
  }
  return candidate as QuoteDocument;
}

export async function GET(req: NextRequest, { params }: Params) {
  const tenant = await tenantFromRequest(req);
  if (!tenant) {
    return NextResponse.json({ error: "session required" }, { status: 401, headers: noStore });
  }
  const { id } = await params;
  try {
    const draft = await getDraft(tenant.siteCode, id);
    if (!draft) {
      return NextResponse.json({ error: "not found" }, { status: 404, headers: noStore });
    }
    const [versions, audit] = await Promise.all([
      listVersions(tenant.siteCode, id),
      listAuditEvents(tenant.siteCode, id),
    ]);
    return NextResponse.json({ draft, versions, audit }, { headers: noStore });
  } catch (error) {
    if (isDatabaseUnavailable(error)) {
      return NextResponse.json(
        { error: "storage unavailable", message: "DATABASE_URL이 없어 견적을 읽을 수 없습니다." },
        { status: 503, headers: noStore },
      );
    }
    console.error("[quotes] get failed", { message: (error as Error).message });
    return NextResponse.json({ error: "get failed" }, { status: 500, headers: noStore });
  }
}

export async function PUT(req: NextRequest, { params }: Params) {
  const tenant = await tenantFromRequest(req);
  if (!tenant) {
    return NextResponse.json({ error: "session required" }, { status: 401, headers: noStore });
  }
  const { id } = await params;

  let body: { document?: unknown; revision?: unknown };
  try {
    body = (await req.json()) as { document?: unknown; revision?: unknown };
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400, headers: noStore });
  }

  const doc = parseDocument(body.document);
  const revision = Number(body.revision);
  if (!doc || !Number.isInteger(revision) || revision < 1) {
    return NextResponse.json({ error: "invalid body" }, { status: 400, headers: noStore });
  }

  const validation = validateDocument(doc);
  if (!validation.valid) {
    return NextResponse.json(
      { error: "invalid document", validation },
      { status: 422, headers: noStore },
    );
  }

  try {
    const result = await saveDraft(tenant.siteCode, id, doc, revision);
    if (!result.ok) {
      if (result.reason === "conflict") {
        return NextResponse.json(
          {
            error: "conflict",
            message: "다른 화면에서 먼저 저장했습니다. 최신 내용을 불러온 뒤 다시 저장하세요.",
            current: result.current,
          },
          { status: 409, headers: noStore },
        );
      }
      return NextResponse.json({ error: "not found" }, { status: 404, headers: noStore });
    }
    return NextResponse.json(
      { ok: true, revision: result.revision, updatedAt: result.updatedAt },
      { headers: noStore },
    );
  } catch (error) {
    if (isDatabaseUnavailable(error)) {
      return NextResponse.json(
        { error: "storage unavailable", message: "DATABASE_URL이 없어 저장할 수 없습니다." },
        { status: 503, headers: noStore },
      );
    }
    console.error("[quotes] save failed", { message: (error as Error).message });
    return NextResponse.json({ error: "save failed" }, { status: 500, headers: noStore });
  }
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const tenant = await tenantFromRequest(req);
  if (!tenant) {
    return NextResponse.json({ error: "session required" }, { status: 401, headers: noStore });
  }
  const { id } = await params;
  try {
    const deleted = await deleteDraft(tenant.siteCode, id);
    if (!deleted) {
      return NextResponse.json({ error: "not found" }, { status: 404, headers: noStore });
    }
    return NextResponse.json({ ok: true }, { headers: noStore });
  } catch (error) {
    if (isDatabaseUnavailable(error)) {
      return NextResponse.json(
        { error: "storage unavailable", message: "DATABASE_URL이 없어 삭제할 수 없습니다." },
        { status: 503, headers: noStore },
      );
    }
    console.error("[quotes] delete failed", { message: (error as Error).message });
    return NextResponse.json({ error: "delete failed" }, { status: 500, headers: noStore });
  }
}

export async function POST(req: NextRequest, { params }: Params) {
  const tenant = await tenantFromRequest(req);
  if (!tenant) {
    return NextResponse.json({ error: "session required" }, { status: 401, headers: noStore });
  }
  const { id } = await params;
  try {
    const body = (await req.json().catch(() => ({}))) as { action?: string; format?: string };
    if (body.action === "export") {
      await recordExport(tenant.siteCode, id, body.format ?? "unknown");
      return NextResponse.json({ ok: true }, { headers: noStore });
    }
    return NextResponse.json({ error: "unknown action" }, { status: 400, headers: noStore });
  } catch (error) {
    if (isDatabaseUnavailable(error)) {
      return NextResponse.json({ error: "storage unavailable" }, { status: 503, headers: noStore });
    }
    console.error("[quotes] action failed", { message: (error as Error).message });
    return NextResponse.json({ error: "action failed" }, { status: 500, headers: noStore });
  }
}
