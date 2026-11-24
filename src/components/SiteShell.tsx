"use client";
import Link from "./NavigationLink";
import { usePublicSearchParams } from "@/lib/use-public-search-params";
import { Menu } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type MouseEvent, type ReactNode } from "react";
import { href, local, navigation, type Locale } from "@/lib/content";
import { rememberPublicLocale, selectPublicLocale } from "@/lib/public-locale";
import { usePublicContent } from "@/lib/use-public-content";
import { contentText } from "@/lib/public-content";
import { AdditionalSections } from "./EditorialContent";
import MobileNavDrawer from "./MobileNavDrawer";
import BrandMark from "./BrandMark";
import { companyName } from "@/lib/company";
import FloatingContact from "./FloatingContact";
import ContactsBox from "./ContactsBox";
import FooterStatistics from "./FooterStatistics";
import styles from "./SiteShell.module.css";

export function Brand({locale,alt}:{locale:Locale;alt?:string}) { return <span className={styles.brand}><BrandMark className={styles.brandLogo} locale={locale} alt={alt}/></span>; }
const footerNavigation = [
  ...navigation.map(item => item.id === "about" ? { ...item, title: { ...item.title, en: "About Us" } } : item),
  { id: "contact", title: { en: "Contact Us", th: "ติดต่อเรา" } },
];
const subscribeToHydration=()=>()=>{};
const interactiveSnapshot=()=>true;
const prerenderedSnapshot=()=>false;
function subscribeHash(listener:()=>void) {
  window.addEventListener("popstate",listener);
  window.addEventListener("hashchange",listener);
  return ()=>{ window.removeEventListener("popstate",listener); window.removeEventListener("hashchange",listener); };
}
function scrollToTop() { window.scrollTo({top:0,behavior:"instant"}); }
function scrollCurrentPageToTop(event:MouseEvent<HTMLElement>) {
  if(event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
  const link=event.target instanceof Element?event.target.closest("a[href]"):null;
  if(link instanceof HTMLAnchorElement&&link.getAttribute("href")!==""&&link.origin===window.location.origin&&link.pathname===window.location.pathname&&link.search===window.location.search&&!link.hash)scrollToTop();
}
let lastClientPath: string | null = null;
let historyNavigationPath: string | null = null;
export function SiteHeader({locale,current}:{locale:Locale;current:string}) {
  const interactive=useSyncExternalStore(subscribeToHydration,interactiveSnapshot,prerenderedSnapshot);
  const [open,setOpen]=useState(false);
  const menuButtonRef=useRef<HTMLButtonElement>(null);
  const closeMenu=useCallback(()=>setOpen(false),[]);
  const search=usePublicSearchParams().toString();
  const query=search ? `?${search}` : "";
  const hash=useSyncExternalStore(subscribeHash,()=>window.location.hash,()=>"");
  const nextLocale=locale==="en"?"th":"en";
  const languagePath=href(nextLocale,current)+query+hash;
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
      <Link className={styles.brandLink} href={href(locale)} aria-label={local(locale,`${companyName('en')} home`,`หน้าแรกของ${companyName('th')}`)}><Brand locale={locale}/></Link>
      <nav className={styles.desktopNav} aria-label={local(locale,"Main navigation","เมนูหลัก")}>
        {navigation.map(item=><Link key={item.id} href={href(locale,item.id)} aria-current={(item.id?current===item.id||current.startsWith(item.id+"/"):!current)?"page":undefined}>{item.title[locale]}</Link>)}
      </nav>
      <div className={styles.actions}><Link className={`button ${styles.contact}`} href={href(locale,"contact")}><span className={styles.contactLong}>{local(locale,"Contact us","ติดต่อเรา")}</span><span className={styles.contactShort}>{local(locale,"Contact","ติดต่อ")}</span></Link><Link className={styles.language} href={languagePath} lang={locale} onClick={event=>selectPublicLocale(event,nextLocale)} onAuxClick={event=>{if(event.button===1)rememberPublicLocale(nextLocale);}} aria-label={local(locale,"Switch to Thai","เปลี่ยนเป็นภาษาอังกฤษ")} title={local(locale,"Switch to Thai","เปลี่ยนเป็นภาษาอังกฤษ")}>{locale==="th"?"TH":"EN"}</Link><button ref={menuButtonRef} className={styles.menu} type="button" disabled={!interactive} onClick={()=>setOpen(true)} aria-expanded={open} aria-label={local(locale,"Open menu","เปิดเมนู")}><Menu/></button></div>
    </div></header>
    <MobileNavDrawer
      open={open}
      onClose={closeMenu}
      triggerRef={menuButtonRef}
      title={local(locale,"Menu","เมนู")}
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
            <Link href={href("th",current)+query+hash} scroll={!!hash} onClick={event=>selectPublicLocale(event,"th")} onAuxClick={event=>{if(event.button===1)rememberPublicLocale("th");}} onNavigate={closeMenu} lang="th" aria-current={locale==="th"?"page":undefined}>ไทย</Link>
            <Link href={href("en",current)+query+hash} scroll={!!hash} onClick={event=>selectPublicLocale(event,"en")} onAuxClick={event=>{if(event.button===1)rememberPublicLocale("en");}} onNavigate={closeMenu} lang="en" aria-current={locale==="en"?"page":undefined}>English</Link>
          </div>
        </div>
      </div>
    </MobileNavDrawer>
  </>;
}
export default function SiteShell({locale,current,children}:{locale:Locale;current:string;children:ReactNode}) {
  const { sections, settings, fleetLinks }=usePublicContent();
  const footer=sections.find(section=>section.id==="footer" && section.parentId==="shared");
  const footerName = local(locale, settings.companyName === "Moe Navigation Co.,Ltd." ? "Moe Navigation Co., Ltd." : settings.companyName, settings.companyNameTh);
  const introduction = contentText(footer, "title", locale);
  const path=href(locale,current);
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
  return <>
    <SiteHeader locale={locale} current={current}/>
    <main id="main" tabIndex={-1}>{children}<div className="container"><AdditionalSections pageId="shared" locale={locale} exclude={["shared-callout","footer","footer-contact"]} /></div></main>
    <footer className={styles.footer} onClickCapture={scrollCurrentPageToTop}>
      <div className="container"><FooterStatistics record={footer} locale={locale} fleetCount={fleetLinks.length}/></div>
      <div className={`container ${styles.footerTop}`}>
        <div className={styles.footerCompany}>
          <Link className={styles.brandLink} href={href(locale)}><Brand locale={locale} alt={footerName}/></Link>
          <p className={styles.companyName}>{footerName}</p>
          {introduction && <p className={styles.introduction}>{introduction}</p>}
        </div>
        <nav aria-labelledby="footer-navigation">
          <h2 id="footer-navigation">{local(locale, "Navigation", "เมนูเว็บไซต์")}</h2>
          <ul>{footerNavigation.map(item => <li key={item.id}><Link href={href(locale, item.id)}>{item.title[locale]}</Link></li>)}</ul>
        </nav>
        {fleetLinks.length > 0 && <nav aria-labelledby="footer-fleet">
          <h2 id="footer-fleet">{local(locale, "Our fleet", "กองเรือของเรา")}</h2>
          <ul>{fleetLinks.map(vessel => <li key={vessel.id}><Link href={href(locale, `fleet/${vessel.id}`)}>{locale === "th" ? vessel.titleTh || vessel.title : vessel.title || vessel.titleTh}</Link></li>)}</ul>
        </nav>}
        <ContactsBox locale={locale} settings={settings}/>
      </div>
      <div className={`container ${styles.footerBottom}`}><span>© {new Date().getFullYear()} {footerName}</span><Link href={href(locale,"privacy")}>{local(locale,"Privacy policy","นโยบายความเป็นส่วนตัว")}</Link></div>
      <FloatingContact key={path} locale={locale}/>
    </footer>
  </>;
}
