// LIFEGRAPH — ParallaxFigure: editorial SVG plates that physically move with scroll.
// Mask opens (clip-path inset) → image reveals → parallax drift + scale → settle.
// GPU-friendly: transform, opacity, clip-path only.
import { useRef, useState } from "react";
import { motion, useScroll, useTransform } from "framer-motion";

interface Props {
  src: string;
  alt: string;
  caption?: string;
  className?: string;
  reducedMotion: boolean;
}

export default function ParallaxFigure({ src, alt, caption, className, reducedMotion }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [imgFailed, setImgFailed] = useState(false);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end start"] });
  const y = useTransform(scrollYProgress, [0, 1], [70, -70]);
  const scale = useTransform(scrollYProgress, [0, 1], [0.72, 1.15]);
  const opacity = useTransform(scrollYProgress, [0, 0.25, 0.8, 1], [0, 1, 1, 0.15]);
  const x = useTransform(scrollYProgress, [0, 1], [-36, 36]);
  // mask wipe: closed → open as the figure enters
  const clip = useTransform(scrollYProgress, [0.05, 0.35], ["inset(12% 8% 12% 8% round 12px)", "inset(0% 0% 0% 0% round 12px)"]);

  if (imgFailed) return null; // never show a broken-image glyph; caption context lives in surrounding copy

  if (reducedMotion) {
    return (
      <figure ref={ref} className={className}>
        <img src={src} alt={alt} loading="lazy" className="w-full rounded-lg border hairline" />
        {caption && <figcaption className="text-dim mt-2 text-xs">{caption}</figcaption>}
      </figure>
    );
  }

  return (
    <figure ref={ref} className={className} style={{ perspective: 900 }}>
      <motion.div style={{ y, scale, x, opacity, clipPath: clip }} className="overflow-hidden rounded-lg border hairline">
        <img src={src} alt={alt} loading="lazy" onError={() => setImgFailed(true)} className="w-full" draggable={false} />
      </motion.div>
      {caption && <figcaption className="text-dim mt-2 text-xs">{caption}</figcaption>}
    </figure>
  );
}
