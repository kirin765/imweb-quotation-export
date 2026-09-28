import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "아임웹 견적서 자동 작성",
  description:
    "아임웹 상품·옵션을 골라 협의 단가로 견적서를 만들고 XLSX와 A4 인쇄/PDF로 내보내는 앱입니다.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body className="antialiased">{children}</body>
    </html>
  );
}
