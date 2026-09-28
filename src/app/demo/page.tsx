import type { Metadata } from "next";
import { QuoteDemoClient } from "@/features/quotes/demo/QuoteDemoClient";

export const metadata: Metadata = {
  title: "견적서 데모 — 아임웹 견적서",
};

export default function DemoPage() {
  return <QuoteDemoClient />;
}
