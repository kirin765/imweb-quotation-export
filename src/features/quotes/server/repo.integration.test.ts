import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { createSampleDocument } from "@/fixtures/samples";
import {
  confirmDraft,
  createDraft,
  deleteDraft,
  duplicateDraft,
  ensureSchema,
  getDraft,
  getSupplier,
  getVersion,
  listAuditEvents,
  listDrafts,
  listVersions,
  saveDraft,
  saveSupplier,
} from "./repo";

/**
 * 실제 Postgres에 붙어 저장·확정·복제·tenant 격리를 확인한다.
 * DATABASE_URL이 없으면 건너뛴다. 전용 합성 siteCode만 쓰고 끝나면 지운다.
 *
 *   DATABASE_URL=... npx vitest run src/features/quotes/server/repo.integration.test.ts
 */
const enabled = !!process.env.DATABASE_URL;
const SITE = "__repo_integration_site__";
const OTHER_SITE = "__repo_integration_other__";
const UNIT = "u0000000000000000000";

const createdDraftIds: string[] = [];

async function cleanup() {
  const sql = db();
  if (!sql) {
    return;
  }
  const sites = [SITE, OTHER_SITE];
  await sql`delete from imq_audit_events where site_code in ${sql(sites)}`;
  await sql`delete from imq_versions where site_code in ${sql(sites)}`;
  await sql`delete from imq_items where draft_id in (
    select id from imq_drafts where site_code in ${sql(sites)}
  )`;
  await sql`delete from imq_drafts where site_code in ${sql(sites)}`;
  await sql`delete from imq_settings where site_code in ${sql(sites)}`;
  await sql`delete from imq_shops where site_code in ${sql(sites)}`;
  await sql`delete from imq_items where draft_id in (
    select id from imq_drafts where site_code like '__repo%'
  )`;
  await sql`delete from imq_drafts where site_code like '__repo%'`;
  await sql`delete from imq_settings where site_code like '__repo%'`;
  await sql`delete from imq_versions where site_code like '__repo%'`;
  await sql`delete from imq_audit_events where site_code like '__repo%'`;
}

describe.skipIf(!enabled)("견적 저장소 (실제 Postgres)", () => {
  beforeAll(async () => {
    await ensureSchema();
    await cleanup();
  });

  afterAll(async () => {
    await cleanup();
    await db()?.end();
    expect(createdDraftIds.length).toBeGreaterThan(0);
  }, 30_000);

  it("초안을 만들면 revision 1, 확정 0건, 다음 버전 1로 시작한다", async () => {
    const draft = await createDraft(SITE, UNIT);
    createdDraftIds.push(draft.id);
    expect(draft.revision).toBe(1);
    expect(draft.version).toBe(0);
    expect(draft.doc.version).toBe(1);
    expect(draft.doc.documentNumber).toMatch(/^Q\d{8}-\d{4}$/);
    expect(draft.doc.items).toHaveLength(1);
    expect(await listVersions(SITE, draft.id)).toEqual([]);
  });

  it("샘플 초안은 상품 10개를 담는다", async () => {
    const draft = await createDraft(SITE, UNIT, createSampleDocument());
    createdDraftIds.push(draft.id);
    expect(draft.doc.items).toHaveLength(10);
    expect(draft.doc.items[0].productName).toBe("샘플 타월");
  });

  it("문서번호는 사이트 안에서 중복되지 않는다", async () => {
    const a = await createDraft(SITE, UNIT);
    const b = await createDraft(SITE, UNIT);
    createdDraftIds.push(a.id, b.id);
    expect(a.doc.documentNumber).not.toBe(b.doc.documentNumber);
  });

  it("저장은 revision을 올리고, 낡은 revision은 충돌로 막는다", async () => {
    const draft = await createDraft(SITE, UNIT, createSampleDocument());
    createdDraftIds.push(draft.id);

    const edited = {
      ...draft.doc,
      recipientCompany: "첫 수정",
      adjustment: { description: "배송비", amount: 3000 },
    };
    const first = await saveDraft(SITE, draft.id, edited, draft.revision);
    expect(first.ok).toBe(true);
    if (!first.ok) {
      throw new Error("save failed");
    }
    expect(first.revision).toBe(draft.revision + 1);

    const stale = await saveDraft(SITE, draft.id, { ...edited, recipientCompany: "늦은 저장" }, draft.revision);
    expect(stale.ok).toBe(false);
    if (stale.ok || stale.reason !== "conflict") {
      throw new Error("expected conflict");
    }
    expect(stale.current.revision).toBe(first.revision);
    expect(stale.current.doc.recipientCompany).toBe("첫 수정");
    expect((await getDraft(SITE, draft.id))?.doc.recipientCompany).toBe("첫 수정");

    const retried = await saveDraft(SITE, draft.id, edited, first.revision);
    expect(retried.ok).toBe(true);
  });

  it("확정하면 snapshot 버전이 쌓이고 확정본은 나중에 바뀌지 않는다", async () => {
    const draft = await createDraft(SITE, UNIT);
    createdDraftIds.push(draft.id);

    const v1Doc = {
      ...draft.doc,
      recipientCompany: "확정 거래처",
      items: [
        { id: "i1", itemCode: "A-1", productName: "첫 품목", optionName: "", quantity: 10, unitPrice: 5000 },
      ],
      adjustment: { description: "배송비", amount: 3000 },
    };
    await saveDraft(SITE, draft.id, v1Doc, draft.revision);
    const afterFirstSave = await getDraft(SITE, draft.id);
    const v1 = await confirmDraft(SITE, draft.id, afterFirstSave!.revision);
    if (!v1.ok) {
      throw new Error(`confirm failed: ${JSON.stringify(v1)}`);
    }
    expect(v1.version).toBe(1);

    const afterConfirm = await getDraft(SITE, draft.id);
    expect(afterConfirm!.version).toBe(1);

    const v2Doc = {
      ...v1Doc,
      items: [
        { id: "i1", itemCode: "A-1", productName: "첫 품목", optionName: "", quantity: 20, unitPrice: 5000 },
      ],
    };
    const second = await saveDraft(SITE, draft.id, v2Doc, afterConfirm!.revision);
    if (!second.ok) {
      throw new Error("second save failed");
    }
    const v2 = await confirmDraft(SITE, draft.id, second.revision);
    if (!v2.ok) {
      throw new Error("second confirm failed");
    }
    expect(v2.version).toBe(2);

    const versions = await listVersions(SITE, draft.id);
    expect(versions.map((item) => item.version)).toEqual([2, 1]);

    const first = await getVersion(SITE, v1.versionId);
    const latest = await getVersion(SITE, v2.versionId);
    expect(first?.summary.subtotal).toBe(50_000);
    expect(first?.summary.total).toBe(53_000);
    expect(latest?.summary.subtotal).toBe(100_000);
    expect(first?.doc.items[0].quantity).toBe(10);

    const confirmedDraft = await getDraft(SITE, draft.id);
    expect(confirmedDraft?.version).toBe(2);
    expect(confirmedDraft?.doc.version).toBe(3);
  });

  it("값이 어긋난 초안은 확정하지 않는다", async () => {
    const draft = await createDraft(SITE, UNIT);
    createdDraftIds.push(draft.id);
    const broken = {
      ...draft.doc,
      recipientCompany: "",
      items: [{ id: "bad", itemCode: "", productName: "", optionName: "", quantity: 0, unitPrice: -1 }],
    };
    await saveDraft(SITE, draft.id, broken, draft.revision);
    const current = await getDraft(SITE, draft.id);
    const result = await confirmDraft(SITE, draft.id, current!.revision);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("invalid");
    }
    expect(await listVersions(SITE, draft.id)).toEqual([]);
  });

  it("복제하면 새 문서번호의 초안이 되고 확정 이력은 따라오지 않는다", async () => {
    const source = await createDraft(SITE, UNIT, createSampleDocument());
    createdDraftIds.push(source.id);
    const current = await getDraft(SITE, source.id);
    await confirmDraft(SITE, source.id, current!.revision);

    const copy = await duplicateDraft(SITE, UNIT, source.id);
    expect(copy).not.toBeNull();
    createdDraftIds.push(copy!.id);
    expect(copy!.id).not.toBe(source.id);
    expect(copy!.doc.documentNumber).not.toBe(source.doc.documentNumber);
    expect(copy!.version).toBe(0);
    expect(copy!.doc.items).toHaveLength(10);
    expect(await listVersions(SITE, copy!.id)).toEqual([]);
  });

  it("다른 사이트는 조회·수정·확정·복제·버전 열람이 모두 막힌다", async () => {
    const draft = await createDraft(SITE, UNIT, createSampleDocument());
    createdDraftIds.push(draft.id);
    const current = await getDraft(SITE, draft.id);
    const confirmed = await confirmDraft(SITE, draft.id, current!.revision);
    if (!confirmed.ok) {
      throw new Error("confirm failed");
    }

    expect(await getDraft(OTHER_SITE, draft.id)).toBeNull();
    expect(await listVersions(OTHER_SITE, draft.id)).toEqual([]);
    expect(await getVersion(OTHER_SITE, confirmed.versionId)).toBeNull();
    expect(await duplicateDraft(OTHER_SITE, UNIT, draft.id)).toBeNull();
    expect(await deleteDraft(OTHER_SITE, draft.id)).toBe(false);
    expect(await listAuditEvents(OTHER_SITE, draft.id)).toEqual([]);

    const foreignSave = await saveDraft(OTHER_SITE, draft.id, draft.doc, current!.revision);
    expect(foreignSave.ok).toBe(false);
    if (!foreignSave.ok) {
      expect(foreignSave.reason).toBe("not_found");
    }
    const foreignConfirm = await confirmDraft(OTHER_SITE, draft.id, current!.revision);
    expect(foreignConfirm.ok).toBe(false);

    expect(await getDraft(SITE, draft.id)).not.toBeNull();
  });

  it("목록은 사이트별로 분리되고 검색·합계·확정 건수가 맞는다", async () => {
    const draft = await createDraft(SITE, UNIT);
    createdDraftIds.push(draft.id);
    const doc = {
      ...draft.doc,
      recipientCompany: "검색대상상사",
      items: [
        { id: "x1", itemCode: "S-1", productName: "품목", optionName: "", quantity: 2, unitPrice: 1000 },
      ],
      adjustment: null,
    };
    await saveDraft(SITE, draft.id, doc, draft.revision);

    const found = await listDrafts(SITE, "검색대상");
    expect(found.some((item) => item.id === draft.id)).toBe(true);
    const row = found.find((item) => item.id === draft.id)!;
    expect(row.total).toBe(2000);
    expect(row.itemCount).toBe(1);
    expect(row.versionCount).toBe(0);

    expect((await listDrafts(SITE, "없는이름")).some((item) => item.id === draft.id)).toBe(false);
    const otherRows = await listDrafts(OTHER_SITE);
    expect(otherRows.some((item) => item.id === draft.id)).toBe(false);

    expect(await deleteDraft(SITE, draft.id)).toBe(true);
    expect((await listDrafts(SITE)).some((item) => item.id === draft.id)).toBe(false);
    expect(await getDraft(SITE, draft.id)).toBeNull();
  });

  it("공급자 설정을 저장하면 새 초안의 공급자 정보에 반영된다", async () => {
    await saveSupplier(SITE, UNIT, {
      companyName: "설정상사",
      businessNumber: "111-11-11111",
      contactName: "담당",
      contactPhone: "02-1111-1111",
      contactEmail: "set@example.com",
      address: "서울",
    });
    expect((await getSupplier(SITE)).companyName).toBe("설정상사");

    const draft = await createDraft(SITE, UNIT);
    createdDraftIds.push(draft.id);
    expect(draft.doc.supplier.companyName).toBe("설정상사");

    const copySource = await createDraft(SITE, UNIT, createSampleDocument());
    createdDraftIds.push(copySource.id);
    expect(copySource.doc.supplier.companyName).toBe("설정상사");
  });

  it("이력에는 확정·복제 같은 사건만 남고 수신처 본문은 남기지 않는다", async () => {
    const draft = await createDraft(SITE, UNIT);
    createdDraftIds.push(draft.id);
    const events = await listAuditEvents(SITE, draft.id);
    expect(events.map((event) => event.event)).toContain("created");
    for (const event of events) {
      expect(JSON.stringify(event.detail)).not.toMatch(/[가-힣]{2,}상사|거래처/);
    }
  });

  it("없는 초안은 저장·확정할 수 없다", async () => {
    const missing = "00000000-0000-4000-8000-000000000000";
    const save = await saveDraft(SITE, missing, createSampleDocument(), 1);
    expect(save.ok).toBe(false);
    if (!save.ok) {
      expect(save.reason).toBe("not_found");
    }
    const confirm = await confirmDraft(SITE, missing, 1);
    expect(confirm.ok).toBe(false);
    expect(await deleteDraft(SITE, missing)).toBe(false);
  });
});
