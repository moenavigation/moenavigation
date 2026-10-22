"use client";
import { useSyncExternalStore } from "react";
import { services, vessels, projects, news } from "./content";
import { demoSeed, getDemoRecords, type DemoRecord } from "./demo-store";
const seedSnapshot = JSON.stringify(demoSeed);
function subscribe(listener:()=>void) {
  window.addEventListener("storage",listener);
  window.addEventListener("moe-demo-content",listener);
  return ()=>{window.removeEventListener("storage",listener);window.removeEventListener("moe-demo-content",listener);};
}
function snapshot() { try{return JSON.stringify(getDemoRecords());}catch{return seedSnapshot;} }
export function useDemoContent() {
  const value=useSyncExternalStore(subscribe,snapshot,()=>seedSnapshot);
  const records:DemoRecord[]=JSON.parse(value);
  const visible=(type:DemoRecord["type"])=>records.filter(r=>r.type===type&&r.status==="Published"&&!r.deletedAt);
  const bilingual=(r:DemoRecord)=>({title:{en:r.title,th:r.titleTh},description:{en:r.description,th:r.descriptionTh}});
  return {
    services:visible("Service").map(r=>({id:r.id,...bilingual(r),image:r.image,icon:services.find(s=>s.id===r.id)?.icon??"Ship"})),
    vessels:visible("Vessel").map(r=>({id:r.id,name:r.title,nameTh:r.titleTh,type:r.category,typeTh:r.categoryTh,image:r.image,description:{en:r.description,th:r.descriptionTh}})),
    projects:visible("Project").map(r=>({id:r.id,...bilingual(r),image:r.image,category:r.category,categoryTh:r.categoryTh})),
    news:visible("News").map(r=>{
      const seed=news.find(s=>s.id===r.id);
      const unchanged=seed && r.title===seed.title.en && r.titleTh===seed.title.th
        && r.description===seed.description.en && r.descriptionTh===seed.description.th
        && r.image===seed.image && r.category===seed.category && !r.categoryTh;
      return {id:r.id,...bilingual(r),image:r.image,category:r.category,categoryTh:r.categoryTh,date:unchanged?seed.date:undefined};
    }),
    pages:visible("Page"), routes:visible("Route"),
  };
}
// Base content remains available to server metadata without browser state.
export const baseContent={services,vessels,projects,news};
