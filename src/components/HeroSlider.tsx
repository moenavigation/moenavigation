"use client";

import Image from "next/image";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { motion } from "motion/react";
import type { ContentImage } from "@/lib/cms-types";
import { local, type Locale } from "@/lib/content";
import styles from "./HeroSlider.module.css";

const reducedMotionQuery = "(prefers-reduced-motion: reduce)";
function subscribeReducedMotion(listener: () => void) {
  const media = window.matchMedia(reducedMotionQuery);
  media.addEventListener("change", listener);
  return () => media.removeEventListener("change", listener);
}
const reducedMotionSnapshot = () => window.matchMedia(reducedMotionQuery).matches;
// Keep the server and first client render paused until the preference is known.
const serverReducedMotionSnapshot = () => true;

export default function HeroSlider({ slides, intervalSeconds, locale }: {
  slides: ContentImage[];
  intervalSeconds: number;
  locale: Locale;
}) {
  const [index, setIndex] = useState(0);
  const [keyboardPaused, setKeyboardPaused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [visible, setVisible] = useState(true);
  const [inView, setInView] = useState(true);
  const reducedMotion = useSyncExternalStore(subscribeReducedMotion, reducedMotionSnapshot, serverReducedMotionSnapshot);
  const root = useRef<HTMLDivElement>(null);
  const indicators = useRef<HTMLDivElement>(null);
  const gesture = useRef<{ pointerId: number; x: number; y: number } | null>(null);
  const activeIndex = index % slides.length;
  const canPlay = slides.length > 1 && reducedMotion === false;
  const rotating = canPlay && !keyboardPaused && !hovered && !dragging && visible && inView;

  useEffect(() => {
    const visibility = () => setVisible(!document.hidden);
    visibility();
    document.addEventListener("visibilitychange", visibility);
    const observer = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting), { threshold: 0.15 });
    if (root.current) observer.observe(root.current);
    return () => { document.removeEventListener("visibilitychange", visibility); observer.disconnect(); };
  }, []);

  useEffect(() => {
    if (!rotating) return;
    const timer = window.setTimeout(() => setIndex(current => (current + 1) % slides.length), intervalSeconds * 1000);
    return () => window.clearTimeout(timer);
  }, [rotating, index, intervalSeconds, slides.length]);

  useEffect(() => {
    const strip = indicators.current;
    const indicator = strip?.children.item(activeIndex) as HTMLElement | null;
    if (!strip || !indicator || strip.scrollWidth <= strip.clientWidth) return;
    const offset = indicator.getBoundingClientRect().left - strip.getBoundingClientRect().left;
    strip.scrollTo({ left: strip.scrollLeft + offset - (strip.clientWidth - indicator.clientWidth) / 2, behavior: reducedMotion ? "instant" : "smooth" });
  }, [activeIndex, reducedMotion]);

  function select(next: number) {
    setIndex((next + slides.length) % slides.length);
  }

  function cancelGesture(element: HTMLDivElement) {
    const start = gesture.current;
    gesture.current = null;
    setDragging(false);
    if (start && element.hasPointerCapture(start.pointerId)) element.releasePointerCapture(start.pointerId);
  }

  if (!slides.length) return null;

  return <div
    ref={root}
    className={styles.slider}
    role="region"
    aria-roledescription={local(locale, "carousel", "ภาพสไลด์")}
    aria-label={local(locale, "Maritime highlights", "ภาพบรรยากาศการเดินเรือ")}
    data-slide-index={activeIndex}
    data-autoplay={rotating}
    data-draggable={slides.length > 1}
    data-dragging={dragging}
    onPointerEnter={event => { if (event.pointerType === "mouse") setHovered(true); }}
    onPointerLeave={() => setHovered(false)}
    onFocusCapture={event => { if (event.target.matches(":focus-visible")) setKeyboardPaused(true); }}
    onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget)) setKeyboardPaused(false); }}
    onKeyDown={event => {
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        event.preventDefault();
        setKeyboardPaused(true);
        select(activeIndex + (event.key === "ArrowLeft" ? -1 : 1));
      }
    }}
    onPointerDown={event => {
      if (!event.isPrimary) { cancelGesture(event.currentTarget); return; }
      if (event.button !== 0) return;
      setKeyboardPaused(false);
      if (slides.length < 2 || indicators.current?.contains(event.target as Node)) return;
      gesture.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
      setDragging(true);
      // Touch and pen pointers have implicit capture; mouse drags need it
      // explicitly so releasing outside the banner still completes the gesture.
      if (event.pointerType === "mouse") event.currentTarget.setPointerCapture(event.pointerId);
    }}
    onPointerMove={event => {
      const start = gesture.current;
      if (!start || start.pointerId !== event.pointerId) return;
      const dx = event.clientX - start.x, dy = event.clientY - start.y;
      if (Math.abs(dy) > 8 && Math.abs(dy) > Math.abs(dx)) cancelGesture(event.currentTarget);
    }}
    onPointerCancel={event => cancelGesture(event.currentTarget)}
    onLostPointerCapture={event => {
      if (gesture.current?.pointerId === event.pointerId) cancelGesture(event.currentTarget);
    }}
    onPointerUp={event => {
      const start = gesture.current;
      setDragging(false);
      if (!start || start.pointerId !== event.pointerId) return;
      cancelGesture(event.currentTarget);
      const dx = event.clientX - start.x, dy = event.clientY - start.y;
      if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy) * 1.5) select(activeIndex + (dx < 0 ? 1 : -1));
    }}
  >
    <div className={styles.images} aria-live={rotating ? "off" : "polite"} aria-atomic="false">
      {slides.map((slide, position) => <motion.div
        key={slide.url}
        className={styles.slide}
        initial={false}
        animate={{ opacity: position === activeIndex ? 1 : 0 }}
        transition={{ duration: reducedMotion ? 0 : 0.7, ease: "easeInOut" }}
        aria-hidden={position !== activeIndex}
        role="group"
        aria-roledescription={local(locale, "slide", "สไลด์")}
        aria-label={local(locale, `${position + 1} of ${slides.length}`, `${position + 1} จาก ${slides.length}`)}
      >
        <Image src={slide.url} alt={(locale === "th" ? slide.altTh : slide.alt) || slide.alt || slide.altTh}
          fill sizes="100vw" loading={position === 0 ? "eager" : "lazy"}
          fetchPriority={position === 0 ? "high" : "auto"} unoptimized={slide.url.startsWith("/")} draggable={false} />
      </motion.div>)}
    </div>
    {slides.length > 1 && <div className={styles.controls}>
      <div ref={indicators} className={styles.dots} aria-label={local(locale, "Choose a slide", "เลือกสไลด์")}>
        {slides.map((slide, position) => <button key={slide.url} type="button"
          className={styles.dot} aria-current={position === activeIndex ? "true" : undefined}
          aria-label={local(locale, `Show slide ${position + 1}`, `แสดงสไลด์ ${position + 1}`)}
          onClick={() => select(position)}><span /></button>)}
      </div>
    </div>}
  </div>;
}
