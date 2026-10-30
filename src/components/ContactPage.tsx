"use client";

import Image from "next/image";
import Link from "./NavigationLink";
import { usePublicSearchParams } from "@/lib/use-public-search-params";
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type FormEvent } from "react";
import { ArrowRight, ArrowUpRight, CheckCircle2, LoaderCircle, Mail, MapPin, Phone, ShieldCheck } from "lucide-react";
import { href, local, type Locale } from "@/lib/content";
import { usePublicContent } from "@/lib/use-public-content";
import { contentText } from "@/lib/public-content";
import { blankContact, contactDraftKey as draftKey, contactTextFields as textFields, contactFieldLimits as fieldLimits, matchesSubmittedDraft, restoreContactDraft, restoreContactSubmission, serializeContactDraft, type ContactValues, type SubmissionAttempt } from "@/lib/contact-draft";
import { contactApiFieldErrors, validateContactValues, type ContactFieldErrors } from "@/lib/contact-validation";
import { AdditionalSections, ContentBody } from "./EditorialContent";
import Dialog from "./Dialog";
import styles from "./ContentPages.module.css";

type ContactErrors = ContactFieldErrors & { submit?: string };

function subscribeContact(listener: () => void) {
  window.addEventListener("storage", listener);
  return () => window.removeEventListener("storage", listener);
}

function contactSnapshot() {
  try { return localStorage.getItem(draftKey) || ""; }
  catch { return ""; /* The form remains usable without local storage. */ }
}

function saveDraft(values: ContactValues, submission?: SubmissionAttempt) {
  try {
    const serialized = serializeContactDraft(values, submission);
    if (serialized) localStorage.setItem(draftKey, serialized);
    else localStorage.removeItem(draftKey);
  } catch { /* Keep the current form input even when storage is unavailable. */ }
}

function savedSubmission(values: ContactValues, fallbackLocale: Locale): SubmissionAttempt | null {
  try {
    return restoreContactSubmission(localStorage.getItem(draftKey), values, fallbackLocale);
  } catch { /* Browser storage is optional. */ }
  return null;
}

export default function ContactPage({ locale }: { locale: Locale }) {
  const { settings, pages } = usePublicContent();
  const page = pages.find((entry) => entry.id === "contact");
  const companyName = local(locale, settings.companyName, settings.companyNameTh);
  const officeAddress = local(locale, settings.officeAddress || settings.officeAddressTh, settings.officeAddressTh || settings.officeAddress);
  const hasContactDetails = officeAddress || settings.phone || settings.email || settings.mapUrl;
  const snapshot = useSyncExternalStore(subscribeContact, contactSnapshot, () => "");
  const requestedSubject = usePublicSearchParams().get("subject")?.slice(0, fieldLimits.subject) || "";
  const [edited, setValues] = useState<ContactValues | null>(null);
  const values = edited || restoreContactDraft(snapshot, requestedSubject);
  const [errors, setErrors] = useState<ContactErrors>({});
  const [pending, setPending] = useState(false);
  const [receipt, setReceipt] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [website, setWebsite] = useState("");
  const submissionRef = useRef<SubmissionAttempt | null>(null);
  const busyRef = useRef(false);
  const invalidFocusRef = useRef<string | null>(null);
  const successRef = useRef<HTMLDivElement>(null);
  const clearFocusRef = useRef(false);
  const clearTriggerRef = useRef<HTMLButtonElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (window.location.hash === "#contact-form") formRef.current?.focus({ preventScroll: true });
  }, []);

  useLayoutEffect(() => {
    if (invalidFocusRef.current) document.getElementById(`contact-${invalidFocusRef.current}`)?.focus();
    invalidFocusRef.current = null;
  }, [errors]);
  useLayoutEffect(() => {
    const success = successRef.current;
    if (!receipt || !success) return;
    success.focus({ preventScroll: true });
    // Reveal the whole focused receipt immediately, clear of fixed controls.
    // Its scroll margins reserve space below the header and above the shortcut.
    success.scrollIntoView({ block: "center", inline: "nearest", behavior: "instant" });
  }, [receipt]);

  function update(field: keyof ContactValues, value: string | boolean) {
    const next = { ...values, [field]: value };
    setValues(next);
    setReceipt(null);
    setErrors((current) => ({ ...current, [field]: undefined, submit: undefined }));
    submissionRef.current = field === "consent" ? submissionRef.current || savedSubmission(values, locale) : null;
    saveDraft(next, submissionRef.current || undefined);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busyRef.current) return;
    const next = validateContactValues(values, locale);
    if (Object.keys(next).length) { invalidFocusRef.current = Object.keys(next)[0]; setErrors(next); return; }

    let submission = submissionRef.current;
    if (!submission) {
      submission = savedSubmission(values, locale) || { id: crypto.randomUUID(), locale };
      submissionRef.current = submission;
    }
    saveDraft(values, submission);
    busyRef.current = true;
    setPending(true);
    setErrors({});
    setReceipt(null);
    try {
      const response = await fetch("/api/contact", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...values, name: values.name.trim(), email: values.email.trim(), company: values.company.trim(), subject: values.subject.trim(), message: values.message.trim(), locale: submission.locale, submissionId: submission.id, website }),
        signal: AbortSignal.timeout(25000),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || typeof data?.id !== "string" || !data.id) {
        if (response.status === 429) throw new Error(local(locale, "There have been several recent enquiries. Please wait a few minutes, then try again. Your message is still here.", "มีการส่งข้อความหลายครั้งในช่วงเวลาสั้น ๆ กรุณารอสักครู่แล้วลองใหม่ ข้อความที่กรอกไว้ยังอยู่"));
        if (response.status === 400) {
          const fields = contactApiFieldErrors(data, locale);
          if (Object.keys(fields).length) {
            invalidFocusRef.current = Object.keys(fields)[0];
            setErrors(fields);
            return;
          }
          throw new Error(local(locale, "Please review your details and try again. Your message has been kept here.", "กรุณาตรวจสอบข้อมูลแล้วลองส่งอีกครั้ง ข้อความที่กรอกไว้ยังอยู่"));
        }
        throw new Error(local(locale, "We could not confirm your enquiry. Please try again; your message is still here and retrying will not create a duplicate.", "ยังยืนยันไม่ได้ว่าระบบได้รับข้อความแล้ว กรุณาลองส่งอีกครั้ง ข้อความที่กรอกไว้ยังอยู่ และระบบจะไม่บันทึกข้อความซ้ำ"));
      }
      setReceipt(data.id);
      setValues({ ...blankContact });
      submissionRef.current = null;
      try {
        // The visitor may have left this page and started another draft while
        // this request was in flight. Only remove the draft we just received.
        if (matchesSubmittedDraft(localStorage.getItem(draftKey), values, submission)) localStorage.removeItem(draftKey);
      } catch { /* A storage failure does not change the confirmed result. */ }
    } catch (error) {
      const message = error instanceof Error && error.name === "Error" ? error.message : local(locale, "The connection was interrupted. Your message is still here. Please try again to confirm delivery.", "การเชื่อมต่อขัดข้อง ข้อความที่กรอกไว้ยังอยู่ กรุณาลองส่งอีกครั้งเพื่อให้แน่ใจว่าระบบได้รับข้อความแล้ว");
      setErrors({ submit: message });
    } finally {
      busyRef.current = false;
      setPending(false);
    }
  }

  function clear() {
    clearFocusRef.current = true;
    setConfirmClear(false);
    setValues({ ...blankContact });
    setErrors({});
    setReceipt(null);
    submissionRef.current = null;
    saveDraft(blankContact);
  }

  const fields = [
    { id: "name", label: local(locale, "Name", "ชื่อ"), auto: "name", required: true },
    { id: "email", label: local(locale, "Email", "อีเมล"), auto: "email", required: true },
    { id: "company", label: local(locale, "Company (optional)", "บริษัท (ไม่บังคับ)"), auto: "organization", required: false },
    { id: "subject", label: local(locale, "Subject", "หัวข้อ"), auto: "off", required: true },
  ] as const;

  return <div className="container section">
    <div className={styles.heading}><div><p className="eyebrow">{contentText(page,"eyebrow",locale)}</p><h1>{contentText(page,"title",locale)}</h1><p className={styles.lead}>{contentText(page,"description",locale)}</p></div></div>
    <div className={styles.contactLayout}>
      <div className={styles.contactIntro}>
        {page?.image && <div className={styles.contactPhoto}><Image src={page.image} loading="eager" alt={contentText(page,"imageAlt",locale) || contentText(page,"title",locale)} fill sizes="(max-width: 850px) 100vw, 45vw" /></div>}
        <h2>{companyName}</h2>
        <ContentBody text={contentText(page,"body",locale)} />
        <div className={styles.contactInfo}>
          {officeAddress && <span><MapPin size={22} aria-hidden="true" /><span className={styles.officeAddress}>{officeAddress}</span></span>}
          {settings.phone && <a href={`tel:${settings.phone.replace(/[^+\d]/g, "")}`}><Phone size={22} aria-hidden="true" /><span>{settings.phone}</span></a>}
          {settings.email && <a href={`mailto:${settings.email}`}><Mail size={22} aria-hidden="true" /><span>{settings.email}</span></a>}
          {settings.mapUrl && <a href={settings.mapUrl} target="_blank" rel="noopener noreferrer"><MapPin size={22} aria-hidden="true" /><span>{local(locale, "Open office map", "เปิดแผนที่สำนักงาน")}</span><ArrowUpRight size={18} aria-hidden="true" /><span className="sr-only">{local(locale, "(opens in a new tab)", "(เปิดในแท็บใหม่)")}</span></a>}
          <span><ShieldCheck size={22} aria-hidden="true" />{local(locale, "Share your requirements and a contact email so our team can respond to your enquiry.", "แจ้งรายละเอียดที่ต้องการสอบถาม พร้อมอีเมลสำหรับให้ทีมงานติดต่อกลับ")}</span>
          {!hasContactDetails && <span><MapPin size={22} aria-hidden="true" />{local(locale, "Verified office, phone and email details will be added when supplied by the company.", "เราจะเพิ่มที่อยู่สำนักงาน หมายเลขโทรศัพท์ และอีเมล เมื่อได้รับข้อมูลที่ยืนยันแล้วจากบริษัท")}</span>}
        </div>
        <p className="notice">{local(locale, "Sending an enquiry does not confirm a booking, service availability or response time.", "การส่งข้อความสอบถามไม่ใช่การยืนยันการจอง ความพร้อมให้บริการ หรือระยะเวลาตอบกลับ")}</p>
      </div>
      <form ref={formRef} id="contact-form" tabIndex={-1} aria-labelledby="contact-form-title" className={styles.contactForm} onSubmit={submit} noValidate aria-busy={pending}>
        <h2 id="contact-form-title">{local(locale, "Send an enquiry", "ส่งข้อความสอบถาม")}</h2>
        <p className={styles.formNote}>{local(locale, "Fields marked * are required. Your unsent draft is kept in this browser when storage is available.", "กรุณากรอกช่องที่มีเครื่องหมาย * หากเบราว์เซอร์อนุญาตให้เก็บข้อมูล ระบบจะเก็บข้อความที่ยังไม่ได้ส่งไว้ให้")}</p>
        {requestedSubject && !receipt && <div className={styles.enquiryContext}><span>{local(locale, "Regarding", "เรื่องที่ต้องการสอบถาม")}</span><strong>{requestedSubject}</strong>{values.subject !== requestedSubject && <><span>{local(locale,"Your saved subject has been kept.","ระบบเก็บหัวข้อเดิมที่คุณกรอกไว้ให้แล้ว")}</span><button type="button" className={styles.clearDraft} disabled={pending} onClick={() => { update("subject", requestedSubject); document.getElementById("contact-subject")?.focus(); }}>{local(locale,"Use this subject","ใช้หัวข้อนี้")}</button></>}</div>}
        {Object.keys(errors).some((key) => key !== "submit" && errors[key as keyof ContactErrors]) && <p className={styles.error} role="alert">{local(locale, "Please correct the highlighted fields before sending.", "กรุณาตรวจสอบช่องที่แจ้งข้อผิดพลาดก่อนส่งข้อความ")}</p>}
        <fieldset className={styles.contactFields} disabled={pending}>
          <legend className="sr-only">{local(locale, "Enquiry details", "รายละเอียดข้อความสอบถาม")}</legend>
          <div className={styles.formGrid}>
            {fields.map((field) => <div className={`field ${(field.id === "subject" || field.id === "company") ? styles.fullField : ""}`} key={field.id}>
              <label htmlFor={`contact-${field.id}`}>{field.label}{field.required && <span aria-hidden="true"> *</span>}</label>
              <input id={`contact-${field.id}`} name={field.id} type={field.id === "email" ? "email" : "text"} autoComplete={field.auto} autoCapitalize={field.id === "email" ? "none" : undefined} spellCheck={field.id === "email" ? false : undefined} value={values[field.id]} onChange={(event) => update(field.id, event.target.value)} maxLength={fieldLimits[field.id]} required={field.required} aria-invalid={!!errors[field.id]} aria-describedby={errors[field.id] ? `error-${field.id}` : undefined} />
              {errors[field.id] && <p className={styles.error} id={`error-${field.id}`}>{errors[field.id]}</p>}
            </div>)}
            <div className={`field ${styles.fullField}`}>
              <label htmlFor="contact-message">{local(locale, "Message", "ข้อความ")} <span aria-hidden="true">*</span></label>
              <textarea id="contact-message" name="message" rows={6} value={values.message} onChange={(event) => update("message", event.target.value)} maxLength={5000} required aria-invalid={!!errors.message} aria-describedby={`contact-message-hint${errors.message ? " error-message" : ""}`} placeholder={local(locale, "Tell us about the scope, location and preferred timing…", "ระบุขอบเขตงาน พื้นที่ และช่วงเวลาที่ต้องการ…")} />
              <div className={styles.messageGuide}><span id="contact-message-hint">{local(locale, "Include your operating area and preferred dates. At least 10 characters.", "ระบุพื้นที่ดำเนินงานและวันที่ต้องการ โดยกรอกข้อความอย่างน้อย 10 ตัวอักษร")}</span><span aria-label={local(locale, `${values.message.length} of 5000 characters`, `${values.message.length} จาก 5000 ตัวอักษร`)}>{values.message.length.toLocaleString(locale)} / 5,000</span></div>
              {errors.message && <p className={styles.error} id="error-message">{errors.message}</p>}
            </div>
          </div>
          <div className={styles.contactTrap} aria-hidden="true"><label htmlFor="contact-website">Website</label><input id="contact-website" name="website" value={website} onChange={(event) => setWebsite(event.target.value)} tabIndex={-1} autoComplete="off" /></div>
          <div className={styles.consent}><input id="contact-consent" type="checkbox" checked={values.consent} onChange={(event) => update("consent", event.target.checked)} aria-invalid={!!errors.consent} aria-describedby={errors.consent ? "error-consent" : undefined} /><div><label htmlFor="contact-consent">{local(locale, "I agree that my information may be used to review and respond to this enquiry.", "ยินยอมให้ใช้ข้อมูลเพื่อพิจารณาและตอบกลับข้อความสอบถามนี้")}</label> <Link href={href(locale, "privacy")}>{local(locale, "Privacy information", "ข้อมูลความเป็นส่วนตัว")}</Link></div></div>
          {errors.consent && <p className={styles.error} id="error-consent">{errors.consent}</p>}
          <div className={styles.formActions}><button className="button" type="submit" disabled={pending}>{pending ? <><LoaderCircle className={styles.loadingIcon} size={19} aria-hidden="true" />{local(locale, "Sending…", "กำลังส่ง…")}</> : <>{local(locale, "Send enquiry", "ส่งข้อความสอบถาม")}<ArrowRight size={19} aria-hidden="true" /></>}</button><button ref={clearTriggerRef} className={styles.clearDraft} type="button" onClick={() => setConfirmClear(true)} disabled={pending || !textFields.some(field => values[field].length > 0)}>{local(locale, "Clear draft", "ลบฉบับร่าง")}</button></div>
        </fieldset>
        {errors.submit && <p className={styles.error} role="alert">{errors.submit}</p>}
        {receipt && <div className={styles.success} role="status" tabIndex={-1} ref={successRef}><CheckCircle2 size={24} aria-hidden="true" /><div><strong>{local(locale, "Your enquiry has been received.", "ได้รับข้อความสอบถามของคุณแล้ว")}</strong><p>{local(locale, "The website team can now review your message.", "ทีมงานสามารถตรวจสอบข้อความของคุณได้แล้ว")}</p><p>{local(locale, "Reference", "หมายเลขอ้างอิง")}: <span className={styles.receipt}>{receipt}</span></p></div></div>}
      </form>
    </div>
    <Dialog open={confirmClear} triggerRef={clearTriggerRef} onClose={() => setConfirmClear(false)} onAfterClose={() => {
      if (!clearFocusRef.current) return;
      clearFocusRef.current = false;
      document.getElementById("contact-name")?.focus();
    }} title={local(locale,"Clear your draft?","ลบฉบับร่างนี้หรือไม่?")} closeLabel={local(locale,"Keep editing","แก้ไขต่อ")}>
      <p className={styles.draftConfirmCopy}>{local(locale,"This removes the unsent text from this form and this browser. Enquiries already submitted are kept.","ข้อความที่ยังไม่ส่งจะถูกลบจากแบบฟอร์มและเบราว์เซอร์นี้ ข้อความที่ส่งสำเร็จแล้วจะยังคงอยู่")}</p>
      <div className={styles.draftConfirmActions}><button type="button" className="button secondary" onClick={() => setConfirmClear(false)}>{local(locale,"Keep editing","แก้ไขต่อ")}</button><button type="button" className="button" onClick={clear}>{local(locale,"Clear draft","ลบฉบับร่าง")}</button></div>
    </Dialog>
    <AdditionalSections pageId="contact" locale={locale} />
  </div>;
}
