// LIFEGRAPH — single centralized scroll controller.
// Lenis (smooth) + GSAP ScrollTrigger (act boundaries + overall progress).
// One listener, one progress ref, predictable scene state. No per-frame React state.
import { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Lenis from "lenis";

gsap.registerPlugin(ScrollTrigger);

export interface Narrative {
  progressRef: React.MutableRefObject<number>;
  activeAct: number;
  registerAct: (index: number) => (el: HTMLElement | null) => void;
}

export function useNarrativeProgress(actCount: number, enabled: boolean, reducedMotion: boolean): Narrative {
  const progressRef = useRef(0);
  const [activeAct, setActiveAct] = useState(0);
  const els = useRef(new Map<number, HTMLElement>());

  useEffect(() => {
    if (!enabled) return;
    let lenis: Lenis | null = null;
    if (!reducedMotion) {
      lenis = new Lenis({ lerp: 0.09, anchors: true });
      lenis.on("scroll", ScrollTrigger.update);
      const tick = (t: number) => lenis?.raf(t * 1000);
      gsap.ticker.add(tick);
      gsap.ticker.lagSmoothing(0);
    }

    const ctx = gsap.context(() => {
      // overall progress across the whole document
      ScrollTrigger.create({
        start: 0,
        end: "max",
        onUpdate: (self) => { progressRef.current = self.progress; },
      });
      // act boundaries
      els.current.forEach((el, index) => {
        ScrollTrigger.create({
          trigger: el,
          start: "top center",
          end: "bottom center",
          onToggle: (self) => { if (self.isActive) setActiveAct(index); },
        });
      });
    });

    const onResize = () => ScrollTrigger.refresh();
    window.addEventListener("resize", onResize);
    // fonts/layout settle → refresh triggers
    const t = setTimeout(() => ScrollTrigger.refresh(), 800);
    // honor act deep-links (#act-N) on load: jump before the user scrolls
    const hash = location.hash;
    if (hash && hash.startsWith("#act-")) {
      const target = document.querySelector(hash);
      if (target) {
        setTimeout(() => {
          if (lenis) lenis.scrollTo(target as HTMLElement, { immediate: true });
          else target.scrollIntoView();
          ScrollTrigger.refresh();
        }, 100);
      }
    }

    return () => {
      clearTimeout(t);
      window.removeEventListener("resize", onResize);
      ctx.revert();
      lenis?.destroy();
      ScrollTrigger.getAll().forEach((s) => s.kill());
    };
  }, [enabled, reducedMotion, actCount]);

  const registerAct = (index: number) => (el: HTMLElement | null) => {
    if (el) els.current.set(index, el);
    else els.current.delete(index);
  };

  return { progressRef, activeAct, registerAct };
}
