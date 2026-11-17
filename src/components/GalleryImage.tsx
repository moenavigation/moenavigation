"use client";

import Image from "next/image";
import { useCallback, useRef, useState } from "react";
import { ImageOff, LoaderCircle, RotateCcw } from "lucide-react";
import { local, type Locale } from "@/lib/content";
import styles from "./GalleryImage.module.css";

type Props = { src: string; alt: string; locale: Locale; sizes: string; highPriority?: boolean };
type ImageState = "loading" | "loaded" | "error";

function SelectedImage({ src, alt, locale, sizes, highPriority }: Props) {
  const [state, setState] = useState<ImageState>("loading");
  const [attempt, setAttempt] = useState(0);
  const request = useRef(0);
  const settle = (next: ImageState) => {
    if (request.current === attempt) setState(next);
  };
  const observeImage = useCallback((image: HTMLImageElement | null) => {
    // Cached images can finish before React attaches the load/error callbacks.
    if (image?.complete && image.currentSrc && request.current === attempt) {
      setState(image.naturalWidth > 0 ? "loaded" : "error");
    }
  }, [attempt]);

  function retry() {
    request.current += 1;
    setAttempt(request.current);
    setState("loading");
  }

  return <div className={styles.frame} data-gallery-image-state={state}>
    <Image key={attempt} ref={observeImage} src={src} alt={alt} fill loading="eager" fetchPriority={highPriority ? "high" : undefined} sizes={sizes} aria-busy={state === "loading"} onLoad={() => settle("loaded")} onError={() => settle("error")} />
    {state === "loading" && <div className={styles.feedback} role="status">
      <LoaderCircle className={styles.spinner} aria-hidden="true" />
      <span>{local(locale, "Loading image", "กำลังโหลดภาพ")}</span>
    </div>}
    {state === "error" && <div className={styles.feedback}>
      <ImageOff className={styles.errorIcon} aria-hidden="true" />
      <p role="status">{local(locale, "Image unavailable", "โหลดภาพไม่สำเร็จ")}</p>
      <button type="button" onClick={retry} aria-label={local(locale, "Retry image", "ลองโหลดภาพอีกครั้ง")}><RotateCcw size={18} aria-hidden="true" />{local(locale, "Try again", "ลองใหม่")}</button>
    </div>}
  </div>;
}

export default function GalleryImage(props: Props) {
  // A previous selection's late callbacks belong only to its unmounted instance.
  return <SelectedImage key={props.src} {...props} />;
}
