"use client";

import dynamic from "next/dynamic";

const QuoteDemo = dynamic(
  () => import("@/features/quotes/demo/QuoteDemo").then((mod) => mod.QuoteDemo),
  {
    ssr: false,
    loading: () => <p className="p-8 text-sm text-neutral-500">데모를 불러오는 중…</p>,
  },
);

export function QuoteDemoClient() {
  return <QuoteDemo />;
}
