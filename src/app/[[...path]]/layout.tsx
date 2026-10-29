import type { ReactNode } from "react";
import { Noto_Sans_Thai } from "next/font/google";
import "../globals.css";
const notoSansThai = Noto_Sans_Thai({ subsets: ["thai", "latin"], display: "swap", variable: "--font-noto-sans-thai" });
export default async function RootLayout({children,params}:{children:ReactNode;params:Promise<{path?:string[]}>}) {
  const {path=[]}=await params;
  return <html lang={path[0]==="th"?"th":"en"} data-scroll-behavior="smooth" className={notoSansThai.variable}><body>{children}</body></html>;
}
