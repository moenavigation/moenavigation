'use client';

import { createContext, useContext, useMemo, useSyncExternalStore, type ReactNode } from 'react';
import { cmsMainThai } from './cms-main-th';
import { cmsFieldsThai } from './cms-fields-th';
import { cmsMessagesThai, translateCmsError } from './cms-messages-th';

export type CmsLocale = 'th' | 'en';
type Parameters = Record<string, string | number>;
const translations: Record<string, string> = { ...cmsMessagesThai, ...cmsFieldsThai, ...cmsMainThai };
const recoverySuffixes = [
  ' Your browser copy is preserved. Retry continues with remaining items.',
  ' The save outcome is uncertain. Keep this editor open and check saved content.',
  ' The upload outcome is uncertain. Check saved media before retrying.',
  ' Refresh this enquiry to load its latest status before trying again.',
];
// Match only complete, known message templates, preserving inserted user text.
// Prefer full status messages over shorter templates whose placeholders could
// otherwise consume the beginning of the message as user-supplied text.
const messageTemplates = Object.entries(translations).filter(([source]) => /\{\w+\}/.test(source)).map(([source, translated]) => {
  const names: string[] = [];
  const pattern = source.split(/(\{\w+\})/).map(part => {
    if (/^\{\w+\}$/.test(part)) { names.push(part.slice(1, -1)); return '([\\s\\S]*?)'; }
    return part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }).join('');
  return { pattern: new RegExp(`^${pattern}$`), names, translated, specificity: source.replace(/\{\w+\}/g, '').length };
}).sort((a, b) => b.specificity - a.specificity);
function translatedMessage(source: string): string {
  if (translations[source] !== undefined) return translations[source];
  for (const suffix of recoverySuffixes) {
    if (source.endsWith(suffix)) return translatedMessage(source.slice(0, -suffix.length)) + translatedMessage(suffix);
  }
  const error = translateCmsError(source);
  if (error !== undefined) return error;
  for (const { pattern, names, translated } of messageTemplates) {
    const match = pattern.exec(source);
    if (match) return translated.replace(/\{(\w+)\}/g, (token, name: string) => {
      const index = names.indexOf(name);
      return index < 0 ? token : match[index + 1];
    });
  }
  return source;
}
const storageKey = 'moe-cms-language';
let localPreference: CmsLocale = 'th';
function snapshot(): CmsLocale {
  try { const stored = localStorage.getItem(storageKey); return stored === 'en' || stored === 'th' ? stored : localPreference; }
  catch { return localPreference; }
}
function subscribe(listener: () => void) {
  window.addEventListener('storage', listener);
  window.addEventListener('cms-language-change', listener);
  return () => {
    window.removeEventListener('storage', listener);
    window.removeEventListener('cms-language-change', listener);
  };
}
function setLocale(locale: CmsLocale) {
  localPreference = locale;
  try { localStorage.setItem(storageKey, locale); } catch { /* Keep the choice for this page when storage is unavailable. */ }
  window.dispatchEvent(new Event('cms-language-change'));
}
export function translateCms(locale: CmsLocale, source: string, parameters?: Parameters) {
  const template = locale === 'th' ? translatedMessage(source) : source;
  return template.replace(/\{(\w+)\}/g, (match, name: string) => parameters?.[name] === undefined ? match : String(parameters[name]));
}
type CmsLocaleValue = { locale: CmsLocale; setLocale: typeof setLocale; t: (source: string, parameters?: Parameters) => string };
const CmsLocaleContext = createContext<CmsLocaleValue | null>(null);

export function CmsLocaleProvider({ children }: { children: ReactNode }) {
  const locale = useSyncExternalStore(subscribe, snapshot, () => 'th' as const);
  const value = useMemo(() => ({ locale, setLocale, t: (source: string, parameters?: Parameters) => translateCms(locale, source, parameters) }), [locale]);
  return <CmsLocaleContext.Provider value={value}><div lang={locale} data-cms-language={locale}>{children}</div></CmsLocaleContext.Provider>;
}

export function useCmsLocale() {
  const context = useContext(CmsLocaleContext);
  if (!context) throw new Error('CMS language must be provided by CmsLocaleProvider.');
  return context;
}
