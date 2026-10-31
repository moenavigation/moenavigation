"use client";
import { useEffect, useId, useRef, type ReactNode, type RefObject } from "react";
import { X } from "lucide-react";
import { containDialogFocus } from "@/lib/dialog-focus";
import styles from "./Dialog.module.css";
export default function Dialog({open,onClose,onAfterClose,triggerRef,title,children,closeLabel="Close dialog",className=""}: {open:boolean;onClose:()=>void;onAfterClose?:()=>void;triggerRef?:RefObject<HTMLElement|null>;title:string;children:ReactNode;closeLabel?:string;className?:string}) {
  const ref=useRef<HTMLDialogElement>(null);
  const returnFocusRef=useRef<HTMLElement|null>(null);
  const backdropPointerRef=useRef(false);
  const id=useId();
  useEffect(()=>{
    const dialog=ref.current;
    if (!dialog) return;
    if(open && !dialog.open) {
      // Pointer activation does not focus buttons in every browser. Prefer the
      // known opener so Escape and Close return to the same control in WebKit.
      returnFocusRef.current=triggerRef?.current ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
      dialog.showModal();
    }
    if(!open && dialog.open) {
      dialog.close();
      if(returnFocusRef.current?.isConnected) returnFocusRef.current.focus({preventScroll:true});
      onAfterClose?.();
    }
  },[open,onAfterClose,triggerRef]);
  useEffect(()=>()=>{
    if(returnFocusRef.current?.isConnected) returnFocusRef.current.focus({preventScroll:true});
  },[]);
  return <dialog ref={ref} className={`${styles.dialog} ${className}`} aria-labelledby={id} onKeyDownCapture={event=>{
    // Search inputs otherwise consume the first Escape to clear their value.
    // The active modal owns Escape, while nested dialogs and IME keep theirs.
    if(event.key === "Escape" && !event.nativeEvent.isComposing && event.target instanceof Element && event.target.closest("dialog") === event.currentTarget) {
      event.preventDefault(); event.stopPropagation(); onClose();
    }
  }} onKeyDown={containDialogFocus} onCancel={e=>{e.preventDefault();onClose();}} onPointerDown={e=>{backdropPointerRef.current=e.target===e.currentTarget;}} onClick={e=>{if(e.target===e.currentTarget && backdropPointerRef.current)onClose();backdropPointerRef.current=false;}}>
    <div className={styles.panel}><div className={styles.heading}><h2 id={id}>{title}</h2><button autoFocus className={styles.close} type="button" onClick={onClose} aria-label={closeLabel}><X aria-hidden="true"/></button></div><div className={styles.content}>{children}</div></div>
  </dialog>;
}
