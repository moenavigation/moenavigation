"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowRight, ArrowUpRight, Menu, Globe2 } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { href, local, navigation, type Locale } from "@/lib/content";
import MobileNavDrawer from "./MobileNavDrawer";
import BrandMark from "./BrandMark";
import styles from "./SiteShell.module.css";

export function Brand() { return <span className={styles.brand}><span className={styles.brandMark}><BrandMark/><strong>MOE</strong></span><span className={styles.brandName}>NAVIGATION</span></span>; }
function subscribeQuery(listener:()=>void) { window.addEventListener("popstate",listener); return ()=>window.removeEventListener("popstate",listener); }
let lastClientPath: string | null = null;
export default function SiteShell({locale,children}:{locale:Locale;children:ReactNode}) {
  const path=usePathname();
  const [open,setOpen]=useState(false);
  const menuButtonRef=useRef<HTMLButtonElement>(null);
  const closeMenu=useCallback(()=>setOpen(false),[]);
  const current=path.replace(/^\/en(?=\/|$)/,"").replace(/^\//,"");
  const query=useSyncExternalStore(subscribeQuery,()=>window.location.search,()=>"");
  const languagePath=href(locale==="en"?"th":"en",current)+query;
  useLayoutEffect(()=>{
    const changed=lastClientPath!==null && lastClientPath!==path;
    lastClientPath=path;
    if(changed && !window.location.hash) {
      window.scrollTo({top:0,behavior:"instant"});
      document.getElementById("main")?.focus({preventScroll:true});
    }
  },[path]);
  useEffect(()=>{
    if(!open)return;
    const desktop=window.matchMedia("(min-width: 1101px)");
    const closeOnDesktop=()=>{if(desktop.matches)closeMenu();};
    desktop.addEventListener("change",closeOnDesktop);
    closeOnDesktop();
    return ()=>desktop.removeEventListener("change",closeOnDesktop);
  },[open,closeMenu]);
  return <>
    <a className="skip-link" href="#main">{local(locale,"Skip to content","ข้ามไปยังเนื้อหา")}</a>
    <header data-site-header="true" className={styles.header}><div className={`container ${styles.headerInner}`}>
      <Link href={href(locale)} aria-label="MOE Navigation home"><Brand/></Link>
      <nav className={styles.desktopNav} aria-label={local(locale,"Main navigation","เมนูหลัก")}>
        {navigation.map(item=><Link key={item.id} href={href(locale,item.id)} aria-current={(item.id?current===item.id||current.startsWith(item.id+"/"):!current)?"page":undefined}>{item.title[locale]}</Link>)}
      </nav>
      <div className={styles.actions}><Link className={styles.language} href={languagePath} lang={locale==="en"?"th":"en"} aria-label={local(locale,"Switch to Thai","เปลี่ยนเป็นภาษาอังกฤษ")}><Globe2 aria-hidden="true"/>{locale==="en"?"TH":"EN"}</Link><Link className={`button ${styles.contact}`} href={href(locale,"contact")}><span className={styles.contactLong}>{local(locale,"Contact us","ติดต่อเรา")}</span><span className={styles.contactShort}>{local(locale,"Contact","ติดต่อ")}</span><ArrowRight aria-hidden="true"/></Link><button ref={menuButtonRef} className={styles.menu} type="button" onClick={()=>setOpen(true)} aria-expanded={open} aria-label={local(locale,"Open menu","เปิดเมนู")}><Menu/></button></div>
    </div></header>
    <MobileNavDrawer
      open={open}
      onClose={closeMenu}
      triggerRef={menuButtonRef}
      eyebrow={local(locale,"Menu","เมนู")}
      title={local(locale,"Explore MOE Navigation","สำรวจ MOE Navigation")}
      closeLabel={local(locale,"Close menu","ปิดเมนู")}
    >
      <nav className={styles.drawerNav} aria-label={local(locale,"Mobile navigation","เมนูสำหรับมือถือ")}>
        {navigation.map(item=><Link key={item.id} href={href(locale,item.id)} scroll={false} onClick={closeMenu} aria-current={(item.id?current===item.id||current.startsWith(item.id+"/"):!current)?"page":undefined}>{item.title[locale]}</Link>)}
      </nav>
      <div className={styles.drawerBottom}>
        <Link className={styles.drawerContact} href={href(locale,"contact")} scroll={false} onClick={closeMenu} aria-current={current==="contact"?"page":undefined}>{local(locale,"Contact us","ติดต่อเรา")}</Link>
        <div className={styles.drawerLocale}>
          <span className={styles.drawerLocaleLabel}>{local(locale,"Language","ภาษา")}</span>
          <div className={styles.drawerLanguage}>
            <Link href={href("th",current)+query} scroll={false} onClick={closeMenu} lang="th" aria-current={locale==="th"?"page":undefined}>ไทย</Link>
            <Link href={href("en",current)+query} scroll={false} onClick={closeMenu} lang="en" aria-current={locale==="en"?"page":undefined}>English</Link>
          </div>
        </div>
      </div>
    </MobileNavDrawer>
    <main id="main" tabIndex={-1}>{children}</main>
    <footer className={styles.footer}><div className={`container ${styles.footerTop}`}><div><Link href={href(locale)}><Brand/></Link><p>{local(locale,"People. Purpose. Every voyage.","ทีมงาน เป้าหมาย และทุกการเดินทาง")}</p></div><div><h3>{local(locale,"Explore","สำรวจ")}</h3><div className={styles.footerLinks}>{navigation.slice(1).map(item=><Link href={href(locale,item.id)} key={item.id}>{item.title[locale]}</Link>)}</div></div><div className={styles.footerContact}><h3>{local(locale,"Let’s move forward.","ก้าวไปข้างหน้าด้วยกัน")}</h3><p>{local(locale,"Tell us about your next maritime operation.","บอกเราเกี่ยวกับงานทางทะเลครั้งต่อไปของคุณ")}</p><Link href={href(locale,"contact")} className="text-link">{local(locale,"Start a conversation","พูดคุยกับเรา")}<ArrowRight/></Link></div></div><div className={`container ${styles.footerBottom}`}><span>© 2026 MOE NAVIGATION</span><div><Link href={href(locale,"privacy")}>{local(locale,"Privacy policy","นโยบายความเป็นส่วนตัว")}</Link><Link href="/cms">{local(locale,"CMS demo","สาธิต CMS")}<ArrowUpRight size={16}/></Link></div></div></footer>
  </>;
}
