import type { Metadata } from "next";
import { notFound } from "next/navigation";
import SiteShell from "@/components/SiteShell";
import Home from "@/components/Home";
import { ContentPage } from "@/components/ContentPages";
import CmsDemo from "@/components/CmsDemo";
import { href, navigation, services, vessels, projects, news, local, type Locale } from "@/lib/content";
const knownPages=["about","services","fleet","routes","projects","news","contact","privacy"];
const siteUrl=process.env.NEXT_PUBLIC_SITE_URL||"http://localhost:3005";
const pageDescriptions: Record<string, {en:string;th:string}> = {
  "": {en:"Explore the MOE Navigation maritime website demo, with illustrative services, vessels and regional connections.",th:"สำรวจเว็บไซต์ตัวอย่าง MOE Navigation พร้อมบริการ เรือ และการเชื่อมต่อในภูมิภาคเพื่อประกอบการนำเสนอ"},
  about: {en:"Learn about the approach and values presented in the MOE Navigation website demo.",th:"ทำความรู้จักแนวทางและคุณค่าที่นำเสนอในเว็บไซต์ตัวอย่าง MOE Navigation"},
  services: {en:"Explore illustrative maritime services and prepare an enquiry about your requirements.",th:"สำรวจบริการทางทะเลตัวอย่างและเตรียมข้อความสอบถามเกี่ยวกับความต้องการของคุณ"},
  fleet: {en:"View a fictional vessel collection with illustrative images and details pending company verification.",th:"ชมกองเรือตัวอย่างพร้อมภาพประกอบ โดยรายละเอียดเรือยังรอการยืนยันจากบริษัท"},
  routes: {en:"Explore approximate regional port connections on an interactive demo map, not for navigation.",th:"สำรวจการเชื่อมต่อระหว่างท่าเรือในภูมิภาคบนแผนที่ตัวอย่างโดยประมาณ ไม่ใช้สำหรับการนำทาง"},
  projects: {en:"Explore illustrative maritime project scenarios; verified company projects will be added later.",th:"สำรวจตัวอย่างสถานการณ์โครงการทางทะเล โดยจะเพิ่มผลงานบริษัทที่ผ่านการยืนยันภายหลัง"},
  news: {en:"Read sample maritime articles and website updates prepared for the MOE Navigation demo.",th:"อ่านบทความทางทะเลและอัปเดตตัวอย่างที่จัดทำสำหรับเว็บไซต์ MOE Navigation"},
  contact: {en:"Prepare an enquiry draft in your browser; live company contact channels are pending.",th:"เตรียมฉบับร่างข้อความสอบถามในเบราว์เซอร์ โดยช่องทางติดต่อจริงของบริษัทยังรอข้อมูล"},
  privacy: {en:"Learn how the MOE Navigation website demo stores contact drafts and content in your browser.",th:"ดูว่าเว็บไซต์ตัวอย่าง MOE Navigation จัดเก็บฉบับร่างข้อความและเนื้อหาในเบราว์เซอร์อย่างไร"},
};
function resolve(path:string[]=[]) {
  const locale:Locale=path[0]==="en"?"en":"th";
  const pieces=locale==="en"?path.slice(1):path;
  return {locale,pieces,page:pieces[0]||"",slug:pieces[1]};
}
export function generateStaticParams() {
  const paths=["",...knownPages,"cms",...services.map(s=>`services/${s.id}`),...vessels.map(v=>`fleet/${v.id}`),...projects.map(p=>`projects/${p.id}`),...news.map(n=>`news/${n.id}`)];
  return paths.flatMap(p=>p==="cms"?[{path:["cms"]}]:[{path:p?p.split("/"):[]},{path:["en",...(p?p.split("/"):[])]}]);
}
export async function generateMetadata({params}:{params:Promise<{path?:string[]}>}):Promise<Metadata> {
  const {path=[]}=await params;
  const {locale,page,slug,pieces}=resolve(path);
  if(page==="cms")return {title:"Content overview · MOE Navigation CMS Demo",robots:{index:false,follow:false}};
  const item=page==="services"?services.find(i=>i.id===slug):page==="fleet"?vessels.find(i=>i.id===slug):page==="projects"?projects.find(i=>i.id===slug):page==="news"?news.find(i=>i.id===slug):undefined;
  const title=!page?local(locale,"Your trusted maritime partner","พันธมิตรที่คุณวางใจ"):item?("name" in item?item.name:item.title[locale]):navigation.find(n=>n.id===page)?.title[locale]||local(locale,page==="contact"?"Contact us":"Privacy policy",page==="contact"?"ติดต่อเรา":"นโยบายความเป็นส่วนตัว");
  const description=item?.description[locale]||pageDescriptions[page]?.[locale]||pageDescriptions[""][locale];
  const pathPart=pieces.join("/");
  return {metadataBase:new URL(siteUrl),title:`${page?title:local(locale,"Your trusted maritime partner","พันธมิตรที่คุณวางใจ")} | MOE Navigation`,description,robots:{index:false,follow:false},alternates:{canonical:href(locale,pathPart),languages:{th:href("th",pathPart),en:href("en",pathPart),"x-default":href("th",pathPart)}},openGraph:{title:`${title} | MOE Navigation`,description,locale:locale==="en"?"en_US":"th_TH",images:[{url:item?.image||"/images/hero.webp"}],type:"website"}};
}
export default async function Page({params}:{params:Promise<{path?:string[]}>}) {
  const {path=[]}=await params;
  const {locale,page,slug,pieces}=resolve(path);
  if(page==="cms"&&pieces.length===1)return <CmsDemo/>;
  if(pieces.length>2||page&&!knownPages.includes(page)||slug&&!["services","fleet","projects","news"].includes(page))notFound();
  return <SiteShell locale={locale}>{page?<ContentPage locale={locale} page={page} slug={slug}/>:<Home locale={locale}/>}</SiteShell>;
}
