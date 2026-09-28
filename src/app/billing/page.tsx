import type { Metadata } from "next";
import Link from "next/link";
import { currentTenantOrNull } from "@/features/quotes/server/session";
import { BillingPanel } from "@/features/billing/BillingPanel";
import { NotInstalled } from "@/features/quotes/editor/NotInstalled";

export const metadata: Metadata = {
  title: "앱 이용권 — 아임웹 견적서",
};

export const dynamic = "force-dynamic";

export default async function BillingPage() {
  const tenant = await currentTenantOrNull();
  if (!tenant) {
    return <NotInstalled what="앱 이용권" />;
  }
  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <header className="border-b border-neutral-300 pb-4">
        <h1 className="text-xl font-bold">앱 이용권</h1>
        <p className="mt-1 text-xs text-neutral-600">
          {tenant.siteName}({tenant.siteCode}) 사이트의 이용권 상태입니다.
        </p>
      </header>
      <div className="mt-4">
        <BillingPanel />
      </div>
      <p className="mt-6 text-xs text-neutral-500">
        <Link className="underline" href="/quotes">
          견적 목록으로
        </Link>
        {" · "}
        <Link className="underline" href="/support">
          이용약관·환불 안내
        </Link>
      </p>
    </main>
  );
}
