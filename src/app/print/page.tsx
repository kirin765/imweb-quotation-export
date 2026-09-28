import type { Metadata } from "next";
import { PrintPreviewClient } from "@/features/quotes/print/PrintPreviewClient";

export const metadata: Metadata = {
  title: "인쇄 미리보기 — 아임웹 견적서",
};

export default function PrintPage() {
  return <PrintPreviewClient />;
}
