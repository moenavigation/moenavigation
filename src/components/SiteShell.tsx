"use client";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { ArrowRight, ArrowUpRight, Menu, Globe2 } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type MouseEvent, type ReactNode } from "react";
import { href, local, navigation, type Locale } from "@/lib/content";
import { usePublicContent } from "@/lib/use-public-content";
import { contentText } from "@/lib/public-content";
import { AdditionalSections } from "./EditorialContent";
import MobileNavDrawer from "./MobileNavDrawer";
import BrandMark from "./BrandMark";
import styles from "./SiteShell.module.css";

export function Brand() { return <span className={styles.brand}><span className={styles.brandMark}><BrandMark/><strong>MOE</strong></span><span className={styles.brandName}>NAVIGATION</span></span>; }
function subscribeHash(listener:()=>void) {
  window.addEventListener("popstate",listener);
  window.addEventListener("hashchange",listener);
  return ()=>{ window.removeEventListener("popstate",listener); window.removeEventListener("hashchange",listener); };
}
function scrollToTop() { window.scrollTo({top:0,behavior:"instant"}); }
function scrollCurrentPageToTop(event:MouseEvent<HTMLElement>) {
  if(event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
  const link=event.target instanceof Element?event.target.closest("a[href]"):null;
  if(link instanceof HTMLAnchorElement&&link.origin===window.location.origin&&link.pathname===window.location.pathname&&link.search===window.location.search&&!link.hash)scrollToTop();
}
let lastClientPath: string | null = null;
let historyNavigationPath: string | null = null;
export default function SiteShell({locale,children}:{locale:Locale;children:ReactNode}) {
  const { sections, settings }=usePublicContent();
  const footer=sections.find(section=>section.id==="footer" && section.parentId==="shared");
  const footerContact=sections.find(section=>section.id==="footer-contact" && section.parentId==="shared");
  const path=usePathname();
  const [open,setOpen]=useState(false);
  const menuButtonRef=useRef<HTMLButtonElement>(null);
  const closeMenu=useCallback(()=>setOpen(false),[]);
  const current=path.replace(/^\/en(?=\/|$)/,"").replace(/^\//,"");
  const search=useSearchParams().toString();
  const query=search ? `?${search}` : "";
  const hash=useSyncExternalStore(subscribeHash,()=>window.location.hash,()=>"");
  const languagePath=href(locale==="en"?"th":"en",current)+query+hash;
  useEffect(()=>{
    // Browser Back/Forward owns restoration of the previous scroll position.
    // Keep the explicit top reset for ordinary navigation to a new page.
    const rememberHistoryNavigation=()=>{historyNavigationPath=window.location.pathname;};
    window.addEventListener("popstate",rememberHistoryNavigation,true);
    return ()=>window.removeEventListener("popstate",rememberHistoryNavigation,true);
  },[]);
  useLayoutEffect(()=>{
    const changed=lastClientPath!==null && lastClientPath!==path;
    const fromHistory=historyNavigationPath===path;
    lastClientPath=path;
    historyNavigationPath=null;
    if(changed && !fromHistory && !window.location.hash) {
      scrollToTop();
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
    <header data-site-header="true" className={styles.header} onClickCapture={scrollCurrentPageToTop}><div className={`container ${styles.headerInner}`}>
      <Link href={href(locale)} aria-label={local(locale,"MOE Navigation home","หน้าหลัก MOE Navigation")}><Brand/></Link>
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
        {navigation.map(item=><Link key={item.id} href={href(locale,item.id)} scroll={false} onNavigate={closeMenu} aria-current={(item.id?current===item.id||current.startsWith(item.id+"/"):!current)?"page":undefined}>{item.title[locale]}</Link>)}
      </nav>
      <div className={styles.drawerBottom}>
        <Link className={styles.drawerContact} href={href(locale,"contact")} scroll={false} onNavigate={closeMenu} aria-current={current==="contact"?"page":undefined}>{local(locale,"Contact us","ติดต่อเรา")}</Link>
        <div className={styles.drawerLocale}>
          <span className={styles.drawerLocaleLabel}>{local(locale,"Language","ภาษา")}</span>
          <div className={styles.drawerLanguage}>
            <Link href={href("th",current)+query+hash} scroll={!!hash} onNavigate={closeMenu} lang="th" aria-current={locale==="th"?"page":undefined}>ไทย</Link>
            <Link href={href("en",current)+query+hash} scroll={!!hash} onNavigate={closeMenu} lang="en" aria-current={locale==="en"?"page":undefined}>English</Link>
          </div>
        </div>
      </div>
    </MobileNavDrawer>
    <main id="main" tabIndex={-1}>{children}<div className="container"><AdditionalSections pageId="shared" locale={locale} exclude={["shared-callout","footer","footer-contact"]} /></div></main>
    <footer className={styles.footer} onClickCapture={scrollCurrentPageToTop}><div className={`container ${styles.footerTop}`}><div><Link href={href(locale)}><Brand/></Link><p>{contentText(footer,"title",locale)}</p></div><div><h3>{local(locale,"Explore","สำรวจ")}</h3><div className={styles.footerLinks}>{navigation.slice(1).map(item=><Link href={href(locale,item.id)} key={item.id}>{item.title[locale]}</Link>)}</div></div><div className={styles.footerContact}><h3>{contentText(footerContact,"title",locale)}</h3><p>{contentText(footerContact,"description",locale)}</p><Link href={href(locale,"contact")} className="text-link">{local(locale,"Start a conversation","พูดคุยกับเรา")}<ArrowRight/></Link></div></div><div className={`container ${styles.footerBottom}`}><span>© {new Date().getFullYear()} {local(locale,settings.companyName,settings.companyNameTh)}</span><div><Link href={href(locale,"privacy")}>{local(locale,"Privacy policy","นโยบายความเป็นส่วนตัว")}</Link><Link href="/cms">{local(locale,"Content management","จัดการเนื้อหา")}<ArrowUpRight size={16}/></Link></div></div></footer>
  </>;
}
