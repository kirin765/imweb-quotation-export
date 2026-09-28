import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { currentTenantOrNull } from "@/features/quotes/server/session";
import { getDraft, listAuditEvents, listVersions } from "@/features/quotes/server/repo";
import { SavedQuoteEditor } from "@/features/quotes/editor/SavedQuoteEditor";
import { NotInstalled } from "@/features/quotes/editor/NotInstalled";

export const metadata: Metadata = {
  title: "견적 초안 — 아임웹 견적서",
};

export const dynamic = "force-dynamic";

export default async function QuoteDraftPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const tenant = await currentTenantOrNull();
  if (!tenant) {
    return <NotInstalled what="견적 초안" />;
  }
  const { id } = await params;

  const draft = await getDraft(tenant.siteCode, id);
  if (!draft) {
    notFound();
  }

  const [versions, audit] = await Promise.all([
    listVersions(tenant.siteCode, id),
    listAuditEvents(tenant.siteCode, id),
  ]);

  return <SavedQuoteEditor initialAudit={audit} initialDraft={draft} initialVersions={versions} />;
}
