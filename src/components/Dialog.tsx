"use client";
import { useEffect, useId, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import styles from "./Dialog.module.css";
export default function Dialog({open,onClose,title,children,closeLabel="Close dialog"}: {open:boolean;onClose:()=>void;title:string;children:ReactNode;closeLabel?:string}) {
  const ref=useRef<HTMLDialogElement>(null);
  const id=useId();
  useEffect(()=>{
    const dialog=ref.current;
    if (!dialog) return;
    if(open && !dialog.open) dialog.showModal();
    if(!open && dialog.open) dialog.close();
  },[open]);
  return <dialog ref={ref} className={styles.dialog} aria-labelledby={id} onCancel={e=>{e.preventDefault();onClose();}} onClick={e=>{if(e.target===e.currentTarget)onClose();}}>
    <div className={styles.panel}><div className={styles.heading}><h2 id={id}>{title}</h2><button autoFocus className={styles.close} type="button" onClick={onClose} aria-label={closeLabel}><X/></button></div>{children}</div>
  </dialog>;
}
