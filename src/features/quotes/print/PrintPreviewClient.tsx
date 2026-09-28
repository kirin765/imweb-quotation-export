"use client";

import dynamic from "next/dynamic";

const PrintPreview = dynamic(
  () => import("@/features/quotes/print/PrintPreview").then((mod) => mod.PrintPreview),
  {
    ssr: false,
    loading: () => <p className="p-8 text-sm text-neutral-500">인쇄 화면을 준비하는 중…</p>,
  },
);

export function PrintPreviewClient() {
  return <PrintPreview />;
}
