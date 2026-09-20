// LIFEGRAPH — typography animation primitives.
// Word-level masked reveals with fully preserved accessibility: visible words
// are aria-hidden spans; screen readers get one clean sr-only string.
// Reduced-motion renders plain text (no split, no stagger).
import { motion } from "framer-motion";
import type { ReactNode } from "react";

interface WordsProps {
  text: string;
  as?: "h1" | "h2" | "h3" | "p" | "span";
  className?: string;
  delay?: number;
  stagger?: number;
  reducedMotion: boolean;
}

export function Words({ text, as = "h2", className, delay = 0, stagger = 0.06, reducedMotion }: WordsProps) {
  if (reducedMotion) {
    const Tag = as as "h2";
    return <Tag className={className}>{text}</Tag>;
  }
  const Tag = as as "h2";
  const words = text.split(/\s+/);
  return (
    <Tag className={className} aria-label={text}>
      {words.map((w, i) => (
        <span key={i} aria-hidden className="inline-block overflow-hidden pb-[0.08em] -mb-[0.08em] align-bottom">
          <motion.span
            className="inline-block will-change-transform"
            initial={{ y: "110%" }}
            whileInView={{ y: "0%" }}
            viewport={{ once: true, margin: "-18% 0px" }}
            transition={{ duration: 0.7, delay: delay + i * stagger, ease: [0.22, 1, 0.36, 1] }}
          >
            {w}
          </motion.span>
          {i < words.length - 1 ? "\u00A0" : ""}
        </span>
      ))}
    </Tag>
  );
}

interface FadeProps {
  children: ReactNode;
  className?: string;
  delay?: number;
  y?: number;
}

/** Small block reveal (opacity + rise). For UI panels, cards, metadata. */
export function Fade({ children, className, delay = 0, y = 36 }: FadeProps) {
  return (
    <motion.div className={className} initial={{ opacity: 0, y }} whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-18% 0px" }} transition={{ duration: 0.9, delay, ease: [0.22, 1, 0.36, 1] }}>
      {children}
    </motion.div>
  );
}
