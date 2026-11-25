"use client";

import Image from "next/image";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { motion } from "motion/react";
import { Play } from "lucide-react";
import type { HomeSlide } from "@/lib/cms-types";
import { homeSlideVideoPoster, isBundledHomeSlide, mobileHomeSlidePhoto } from "@/lib/home-slides";
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
const serverReducedMotionSnapshot = () => undefined;

export default function HeroSlider({ slides, intervalSeconds, locale }: {
  slides: HomeSlide[];
  intervalSeconds: number;
  locale: Locale;
}) {
  const [index, setIndex] = useState(0);
  const [keyboardPaused, setKeyboardPaused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [visible, setVisible] = useState(true);
  const [inView, setInView] = useState(true);
  const [videoMode, setVideoMode] = useState<"auto" | "play" | "ended" | "blocked" | "error">("auto");
  const [outgoingVideo, setOutgoingVideo] = useState<string>();
  const reducedMotion = useSyncExternalStore<boolean | undefined>(subscribeReducedMotion, reducedMotionSnapshot, serverReducedMotionSnapshot);
  const root = useRef<HTMLDivElement>(null);
  const indicators = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const gesture = useRef<{ pointerId: number; x: number; y: number } | null>(null);
  const activeIndex = index % slides.length;
  const activeVideo = slides[activeIndex]?.kind === "video" ? slides[activeIndex].url : undefined;
  const playVideo = visible && inView && (videoMode === "play" || (videoMode === "auto" && reducedMotion === false));
  const showPlayButton = activeVideo && (videoMode === "blocked" || videoMode === "ended" || (videoMode === "auto" && reducedMotion === true));
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
    const element = video.current;
    if (!element || !playVideo) return;
    let cancelled = false;
    let stallTimer: number;
    const clearStall = () => window.clearTimeout(stallTimer);
    const watchStall = () => {
      clearStall();
      stallTimer = window.setTimeout(() => setVideoMode("blocked"), 12000);
    };
    if (element.readyState < HTMLMediaElement.HAVE_FUTURE_DATA) watchStall();
    element.addEventListener("waiting", watchStall);
    element.addEventListener("playing", clearStall);
    element.play().catch(() => {
      if (!cancelled) setVideoMode(element.error ? "error" : "blocked");
    });
    return () => {
      cancelled = true;
      clearStall();
      element.removeEventListener("waiting", watchStall);
      element.removeEventListener("playing", clearStall);
      element.pause();
    };
  }, [activeVideo, playVideo]);

  useEffect(() => {
    if (!rotating || (activeVideo && !["ended", "blocked", "error"].includes(videoMode))) return;
    const timer = window.setTimeout(() => {
      setOutgoingVideo(activeVideo);
      setIndex(current => (current + 1) % slides.length);
      setVideoMode("auto");
    }, activeVideo && videoMode === "ended" ? 0 : intervalSeconds * 1000);
    return () => window.clearTimeout(timer);
  }, [rotating, index, intervalSeconds, slides.length, activeVideo, videoMode]);

  useEffect(() => {
    const strip = indicators.current;
    const indicator = strip?.children.item(activeIndex) as HTMLElement | null;
    if (!strip || !indicator || strip.scrollWidth <= strip.clientWidth) return;
    const offset = indicator.getBoundingClientRect().left - strip.getBoundingClientRect().left;
    strip.scrollTo({ left: strip.scrollLeft + offset - (strip.clientWidth - indicator.clientWidth) / 2, behavior: reducedMotion ? "instant" : "smooth" });
  }, [activeIndex, reducedMotion]);

  function select(next: number) {
    const position = (next + slides.length) % slides.length;
    if (position !== activeIndex) {
      setOutgoingVideo(activeVideo);
      setIndex(position);
      setVideoMode("auto");
    }
  }

  function startVideo() {
    const element = video.current;
    if (!element) return;
    // The Play button disappears when playback starts. Keep keyboard focus in the carousel.
    if (document.activeElement?.matches(":focus-visible") && root.current?.contains(document.activeElement)) {
      const indicator = indicators.current?.querySelector<HTMLButtonElement>('[aria-current="true"]');
      (indicator ?? root.current).focus({ preventScroll: true });
    }
    // Call play inside the click so browsers requiring a user gesture can start.
    void element.play().catch((error: DOMException) => {
      if (error.name !== "AbortError" && video.current === element) setVideoMode(element.error ? "error" : "blocked");
    });
    setVideoMode("play");
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
    tabIndex={-1}
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
      if (slides.length < 2 || (event.target as Element).closest("button")) return;
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
      {slides.map((slide, position) => {
        const mobilePhoto = mobileHomeSlidePhoto(slide.url);
        const isVideo = slide.kind === "video";
        const poster = isVideo ? homeSlideVideoPoster(slide.url) : undefined;
        const description = (locale === "th" ? slide.altTh : slide.alt) || slide.alt || slide.altTh;
        const showPoster = position === activeIndex && videoMode === "error" && poster;
        return <motion.div
        key={slide.url}
        className={styles.slide}
        data-native-crop={isVideo || isBundledHomeSlide(slide.url, "image") ? true : undefined}
        initial={false}
        animate={{ opacity: position === activeIndex ? 1 : 0 }}
        transition={{ duration: reducedMotion ? 0 : 0.7, ease: "easeInOut" }}
        onAnimationComplete={() => {
          if (position !== activeIndex && slide.url === outgoingVideo) setOutgoingVideo(undefined);
        }}
        aria-hidden={position !== activeIndex}
        role="group"
        aria-roledescription={local(locale, "slide", "สไลด์")}
        aria-label={local(locale, `${position + 1} of ${slides.length}`, `${position + 1} จาก ${slides.length}`)}
      >
        {showPoster ? <Image src={poster} alt={description} fill unoptimized draggable={false} />
          : isVideo ? ((position === activeIndex || slide.url === outgoingVideo) && <video
          ref={position === activeIndex ? video : undefined} src={slide.url} poster={poster} muted playsInline
          preload="none" loop={slides.length === 1 && reducedMotion === false}
          aria-label={description || local(locale, "Maritime video", "วิดีโอการเดินเรือ")}
          onEnded={position === activeIndex ? () => setVideoMode("ended") : undefined}
          onError={position === activeIndex ? () => setVideoMode("error") : undefined} />)
          : <picture>
          {mobilePhoto && <source media="(max-width: 700px)" srcSet={mobilePhoto} />}
          <Image src={slide.url} alt={description}
          fill sizes="(max-width: 700px) 169vw, 110vw" loading={position === 0 ? "eager" : "lazy"}
          fetchPriority={position === 0 ? "high" : "auto"} unoptimized={slide.url.startsWith("/")} draggable={false} /></picture>}
      </motion.div>;
      })}
    </div>
    {(slides.length > 1 || showPlayButton) && <div className={styles.controls}>
      {showPlayButton && <button type="button" className={styles.videoControl}
        aria-label={local(locale, "Play video", "เล่นวิดีโอ")} onClick={startVideo}>
        <Play size={18} aria-hidden="true" />
      </button>}
      {slides.length > 1 && <div ref={indicators} className={styles.dots} aria-label={local(locale, "Choose a slide", "เลือกสไลด์")}>
        {slides.map((slide, position) => <button key={slide.url} type="button"
          className={styles.dot} aria-current={position === activeIndex ? "true" : undefined}
          aria-label={local(locale, `Show slide ${position + 1}`, `แสดงสไลด์ ${position + 1}`)}
          onClick={() => select(position)}><span /></button>)}
      </div>}
    </div>}
  </div>;
}
