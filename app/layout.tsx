import type { Metadata } from "next";
import { Noto_Sans } from "next/font/google";
import "./globals.css";
import "./action-link.css";

const notoSans = Noto_Sans({ subsets:["latin"], display:"swap", variable:"--font-noto-sans" });

export const metadata: Metadata = {
  title: "Shopee Hub | Store Command Center",
  description: "Shopee Malaysia 与 Singapore 店铺的经营、广告、订单、健康与客户行动中心。",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-Hans" className={notoSans.variable}><body>{children}</body></html>;
}
