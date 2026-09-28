import type { Metadata } from "next";
import { currentTenantOrNull } from "@/features/quotes/server/session";
import { getSupplier } from "@/features/quotes/server/repo";
import { SettingsForm } from "@/features/quotes/editor/SettingsForm";
import { NotInstalled } from "@/features/quotes/editor/NotInstalled";

export const metadata: Metadata = {
  title: "공급자 설정 — 아임웹 견적서",
};

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const tenant = await currentTenantOrNull();
  if (!tenant) {
    return <NotInstalled what="공급자 설정" />;
  }
  const supplier = await getSupplier(tenant.siteCode);
  return (
    <SettingsForm
      initialSupplier={supplier}
      siteCode={tenant.siteCode}
      siteName={tenant.siteName}
    />
  );
}
