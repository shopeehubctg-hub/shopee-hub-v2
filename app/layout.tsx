import type { Metadata } from "next";
import "./globals.css";
import "./action-link.css";

export const metadata: Metadata = {
  title: "Shopee Hub | Store Command Center",
  description: "Shopee Malaysia 与 Singapore 店铺的经营、广告、订单、健康与客户行动中心。",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-Hans"><body>{children}</body></html>;
}
