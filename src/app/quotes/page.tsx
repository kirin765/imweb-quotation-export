import type { Metadata } from "next";
import { currentTenantOrNull } from "@/features/quotes/server/session";
import { listDrafts } from "@/features/quotes/server/repo";
import { QuoteList } from "@/features/quotes/editor/QuoteList";
import { NotInstalled } from "@/features/quotes/editor/NotInstalled";

export const metadata: Metadata = {
  title: "견적 목록 — 아임웹 견적서",
};

export const dynamic = "force-dynamic";

export default async function QuotesPage() {
  const tenant = await currentTenantOrNull();
  if (!tenant) {
    return <NotInstalled what="견적 목록" />;
  }
  const drafts = await listDrafts(tenant.siteCode);
  return (
    <QuoteList initialDrafts={drafts} siteCode={tenant.siteCode} siteName={tenant.siteName} />
  );
}
