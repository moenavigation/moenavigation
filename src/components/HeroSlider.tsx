"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { ArrowLeft, ArrowRight, Pause, Play } from "lucide-react";
import type { ContentImage } from "@/lib/cms-types";
import { local, type Locale } from "@/lib/content";
import styles from "./HeroSlider.module.css";

export default function HeroSlider({ slides, intervalSeconds, locale }: {
  slides: ContentImage[];
  intervalSeconds: number;
  locale: Locale;
}) {
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [hovered, setHovered] = useState(false);
  const [visible, setVisible] = useState(true);
  const [inView, setInView] = useState(true);
  const reducedMotion = useReducedMotion();
  const root = useRef<HTMLDivElement>(null);
  const indicators = useRef<HTMLDivElement>(null);
  const gesture = useRef<{ x: number; y: number } | null>(null);
  const activeIndex = index % slides.length;
  const canPlay = slides.length > 1 && reducedMotion === false;
  const rotating = canPlay && playing && !hovered && visible && inView;

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
    setPlaying(false);
    setIndex((next + slides.length) % slides.length);
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
    onPointerEnter={event => { if (event.pointerType === "mouse") setHovered(true); }}
    onPointerLeave={() => { setHovered(false); gesture.current = null; }}
    onFocusCapture={event => { if (event.target.matches(":focus-visible")) setPlaying(false); }}
    onKeyDown={event => {
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        event.preventDefault();
        select(activeIndex + (event.key === "ArrowLeft" ? -1 : 1));
      }
    }}
    onPointerDown={event => {
      if (event.pointerType === "mouse" || (event.target as Element).closest("button")) return;
      gesture.current = { x: event.clientX, y: event.clientY };
    }}
    onPointerCancel={() => { gesture.current = null; }}
    onPointerUp={event => {
      const start = gesture.current;
      gesture.current = null;
      if (!start) return;
      const dx = event.clientX - start.x, dy = event.clientY - start.y;
      if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy) * 1.5) select(activeIndex + (dx < 0 ? 1 : -1));
    }}
  >
    <div className={styles.images} aria-live={playing && canPlay ? "off" : "polite"} aria-atomic="false">
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
      <span className={styles.count} aria-hidden="true"><strong>{String(activeIndex + 1).padStart(2, "0")}</strong><span />{String(slides.length).padStart(2, "0")}</span>
      <div ref={indicators} className={styles.dots} aria-label={local(locale, "Choose a slide", "เลือกสไลด์")}>
        {slides.map((slide, position) => <button key={slide.url} type="button"
          className={styles.dot} aria-current={position === activeIndex ? "true" : undefined}
          aria-label={local(locale, `Show slide ${position + 1}`, `แสดงสไลด์ ${position + 1}`)}
          onClick={() => select(position)}><span /></button>)}
      </div>
      <div className={styles.arrows}>
        <button type="button" onClick={() => select(activeIndex - 1)} aria-label={local(locale, "Previous slide", "สไลด์ก่อนหน้า")}><ArrowLeft aria-hidden="true" /></button>
        {canPlay && <button type="button" onClick={() => setPlaying(current => !current)} aria-label={playing ? local(locale, "Pause slideshow", "หยุดสไลด์อัตโนมัติ") : local(locale, "Play slideshow", "เล่นสไลด์อัตโนมัติ")}>
          {playing ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}
        </button>}
        <button type="button" onClick={() => select(activeIndex + 1)} aria-label={local(locale, "Next slide", "สไลด์ถัดไป")}><ArrowRight aria-hidden="true" /></button>
      </div>
    </div>}
  </div>;
}
