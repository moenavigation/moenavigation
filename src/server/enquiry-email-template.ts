import 'server-only';
import type { Enquiry } from '@/lib/cms-types';
import type { EmailEnvelope } from './enquiry-notifications';

const brand = 'MOE Navigation';
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!);
// HTML break opportunities also work when a mail client removes wrapping CSS.
// Split raw ASCII tokens before escaping, so entities and Thai graphemes stay intact.
const contentHtml = (value: string) => value.split(/([\x21-\x7e]{40,})/g).map(part =>
  part.length >= 40 && /^[\x21-\x7e]+$/.test(part)
    ? part.match(/.{1,8}/g)!.map(escapeHtml).join('<wbr>') : escapeHtml(part),
).join('');
const lines = (value: string) => contentHtml(value).replace(/\r\n?|\n/g, '<br>');

/** Inline styles and presentation tables keep this standalone email usable in mail clients. */
export function enquiryEmailTemplate(enquiry: Enquiry, config: { from: string; to: string | string[] }, received: string, inbox: string | null): EmailEnvelope {
  const thai = enquiry.locale === 'th';
  const copy = thai ? {
    title: 'ข้อความสอบถามใหม่', intro: 'มีผู้ส่งข้อความผ่านเว็บไซต์ MOE Navigation โดยบันทึกข้อความไว้ใน CMS แล้ว',
    reply: 'ตอบกลับอีเมลนี้เพื่อติดต่อผู้ส่งข้อความโดยตรง', subject: 'หัวข้อ', sender: 'ผู้ส่งข้อความ',
    message: 'ข้อความ', received: 'วันที่ได้รับ', reference: 'เลขอ้างอิง', language: 'ภาษาของข้อความ',
    open: 'เปิดกล่องข้อความ CMS', footer: 'การแจ้งเตือนข้อความจากเว็บไซต์ MOE Navigation',
    reason: 'คุณได้รับอีเมลนี้เนื่องจากอีเมลของคุณอยู่ในรายชื่อผู้รับการแจ้งเตือนข้อความจากเว็บไซต์',
  } : {
    title: 'New website enquiry', intro: 'A visitor sent a message through the MOE Navigation website. It is saved in your CMS inbox.',
    reply: 'Reply to this email to contact the sender directly.', subject: 'Subject', sender: 'From',
    message: 'Message', received: 'Received', reference: 'Reference', language: 'Enquiry language',
    open: 'Open CMS inbox', footer: 'MOE Navigation website enquiry notification',
    reason: 'You receive this email because your address is on the website enquiry notification list.',
  };
  // The subject identifies this notification without copying untrusted visitor
  // text into the header. The short server reference keeps enquiries distinct.
  const shortReference = enquiry.id.replace(/[^A-Za-z0-9]/g, '').slice(0, 8);
  const subject = `${brand} | ${thai ? 'ข้อความสอบถามใหม่' : 'New enquiry'}${shortReference ? ` #${shortReference}` : ''}`;
  const language = thai ? 'ไทย' : 'English';
  const labelStyle = 'font-family:Arial,Tahoma,sans-serif;margin:0 0 8px;color:#52677d;font-size:16px;line-height:1.5';
  const textStyle = 'font-family:Arial,Tahoma,sans-serif;margin:0;color:#15324d;font-size:16px;line-height:1.65;overflow-wrap:anywhere;word-break:break-word';
  const text = [
    `${brand} — ${copy.title}`, '', copy.intro, '',
    `${copy.subject}: ${enquiry.subject}`, '', `${copy.sender}: ${enquiry.name}`, enquiry.email,
    ...(enquiry.company ? [enquiry.company] : []), '', `${copy.message}:`, enquiry.message, '', copy.reply,
    ...(inbox ? ['', `${copy.open}: ${inbox}`] : []), '',
    `${copy.received}: ${received}`, `${copy.reference}: ${enquiry.id}`, `${copy.language}: ${language}`, '', copy.footer, copy.reason,
  ].join('\n');
  const html = `<!doctype html>
<html lang="${thai ? 'th' : 'en'}" dir="ltr">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="format-detection" content="telephone=no,date=no,address=no"><title>${copy.title} | ${brand}</title></head>
<body style="margin:0;padding:0;width:100%;background-color:#f2f5f8;color:#15324d;font-family:Arial,Tahoma,sans-serif;font-size:16px;line-height:1.65;-webkit-text-size-adjust:100%">
<table role="presentation" lang="${thai ? 'th' : 'en'}" dir="ltr" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;table-layout:fixed;background-color:#f2f5f8"><tr><td align="center" style="padding:24px 12px">
<!--[if mso]><table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;table-layout:fixed;background-color:#ffffff;border:1px solid #dce5ed;border-top:4px solid #c7353f;border-radius:8px">
<tr><td style="font-family:Arial,Tahoma,sans-serif;padding:20px 24px;background-color:#102f4b;color:#ffffff"><p style="margin:0;font-size:20px;font-weight:bold;line-height:1.4;letter-spacing:.3px">${brand}</p></td></tr>
<tr><td style="font-family:Arial,Tahoma,sans-serif;padding:24px 24px 0"><h1 style="margin:0 0 12px;color:#15324d;font-size:24px;line-height:1.35">${copy.title}</h1><p style="${labelStyle};margin-bottom:24px">${copy.intro}</p>
<p style="${labelStyle}">${copy.subject}</p><h2 style="margin:0 0 24px;color:#15324d;font-size:20px;line-height:1.5;overflow-wrap:anywhere;word-break:break-word">${contentHtml(enquiry.subject)}</h2>
<p style="${labelStyle}">${copy.sender}</p><p style="${textStyle};font-weight:bold">${contentHtml(enquiry.name)}</p><p style="${textStyle}">${contentHtml(enquiry.email)}</p>${enquiry.company ? `<p style="${textStyle}">${contentHtml(enquiry.company)}</p>` : ''}
</td></tr>
<tr><td style="font-family:Arial,Tahoma,sans-serif;padding:24px"><h2 style="${labelStyle};color:#15324d;font-weight:bold">${copy.message}</h2><p style="${textStyle}" dir="auto">${lines(enquiry.message)}</p></td></tr>
<tr><td style="font-family:Arial,Tahoma,sans-serif;padding:0 24px 24px"><p style="${textStyle}">${copy.reply}</p>${inbox ? `<p style="margin:20px 0 0"><a href="${escapeHtml(inbox)}" style="display:inline-block;padding:12px 18px;border:1px solid #15324d;background-color:#15324d;color:#ffffff;font-size:16px;font-weight:bold;line-height:1.5;text-decoration:none;border-radius:4px">${copy.open}</a></p><p style="${labelStyle};margin-top:12px;overflow-wrap:anywhere;word-break:break-word">${contentHtml(inbox)}</p>` : ''}</td></tr>
<tr><td style="font-family:Arial,Tahoma,sans-serif;padding:20px 24px;border-top:1px solid #dce5ed;background-color:#f8fafc">
<p style="${labelStyle}">${copy.received}</p><p style="${textStyle};margin-bottom:16px">${escapeHtml(received)}</p>
<p style="${labelStyle}">${copy.reference}</p><p style="${textStyle};margin-bottom:16px">${contentHtml(enquiry.id)}</p>
<p style="${labelStyle}">${copy.language}</p><p style="${textStyle}">${language}</p></td></tr></table>
<!--[if mso]></td></tr></table><![endif]-->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;table-layout:fixed"><tr><td style="font-family:Arial,Tahoma,sans-serif;padding:20px 12px 0;text-align:center"><p style="${labelStyle}">${copy.footer}</p><p style="${labelStyle};margin-bottom:0">${copy.reason}</p></td></tr></table>
</td></tr></table></body></html>`;
  return { from: `${brand} <${config.from}>`, to: Array.isArray(config.to) ? [...config.to] : [config.to], reply_to: enquiry.email, subject, text, html };
}
