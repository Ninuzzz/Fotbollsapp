"use client";

import { motion, useInView, useMotionValue, useSpring, useTransform, useScroll, useReducedMotion, MotionConfig } from "motion/react";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";

/** Respektera prefers-reduced-motion i hela appen */
export function MotionProvider({ children }: { children: ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}

const EASE = [0.22, 1, 0.36, 1] as const;
const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/**
 * Glider in när elementet scrollas in i bild.
 *
 * Snabbt först: innehållet renderas SYNLIGT från servern. Bara det som ligger under skärmkanten när sidan laddas
 * göms (innan första bildrutan, i en layout-effekt) och animeras sedan in vid scroll. Innehåll som syns direkt
 * behöver alltså aldrig vänta på JavaScript.
 * `intro` = animera in direkt vid sidladdning med ren CSS (startsidans hero), också utan att vänta på JavaScript.
 */
export function Reveal({
  children,
  delay = 0,
  y = 28,
  x = 0,
  duration = 0.6,
  margin = "-60px",
  intro = false,
  className = "",
}: {
  children: ReactNode;
  delay?: number;
  y?: number;
  x?: number;
  duration?: number;
  margin?: `${number}px`;
  intro?: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [armed, setArmed] = useState(false);
  const inView = useInView(ref, { once: true, margin });
  useIsoLayoutEffect(() => {
    if (intro || !ref.current) return;
    if (ref.current.getBoundingClientRect().top > window.innerHeight) setArmed(true);
  }, [intro]);

  if (intro)
    return (
      <div className={`reveal-intro ${className}`} style={{ "--reveal-delay": `${delay}s`, "--reveal-y": `${y}px` } as React.CSSProperties}>
        {children}
      </div>
    );
  return (
    <motion.div
      ref={ref}
      className={className}
      initial={false}
      animate={armed && !inView ? "hidden" : "shown"}
      variants={{
        hidden: { opacity: 0, x, y, transition: { duration: 0 } },
        shown: { opacity: 1, x: 0, y: 0, transition: { duration, delay, ease: EASE } },
      }}
    >
      {children}
    </motion.div>
  );
}

/** Staggrad lista: barnen dyker upp efter varandra */
export function Stagger({ children, className = "", step = 0.05 }: { children: ReactNode[]; className?: string; step?: number }) {
  return (
    <div className={className}>
      {children.map((c, i) => (
        <Reveal key={i} x={-16} y={0} duration={0.45} margin="-40px" delay={Math.min(i * step, 0.8)}>
          {c}
        </Reveal>
      ))}
    </div>
  );
}

/** Siffra som räknar upp när den syns */
export function CountUp({ to, suffix = "", className = "" }: { to: number; suffix?: string; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });
  const reduce = useReducedMotion();
  const mv = useMotionValue(0);
  const spring = useSpring(mv, { duration: 1400, bounce: 0 });
  const rounded = useTransform(spring, (v) => Math.round(v).toLocaleString("sv-SE") + suffix);
  useEffect(() => {
    // Rörelsekänsliga får slutvärdet direkt i stället för en räknande siffra
    if (reduce) {
      mv.jump(to);
      spring.jump(to);
    } else if (inView) mv.set(to);
  }, [inView, reduce, mv, spring, to]);
  // Skärmläsare läser slutvärdet, aldrig "0" eller mellanlägen
  const final = to.toLocaleString("sv-SE") + suffix;
  return (
    <span ref={ref} className={className}>
      <span className="sr-only">{final}</span>
      <motion.span aria-hidden>{rounded}</motion.span>
    </span>
  );
}

/** Parallax-lager för hero */
export function Parallax({ children, speed = 0.3, className = "" }: { children: ReactNode; speed?: number; className?: string }) {
  const { scrollY } = useScroll();
  const y = useTransform(scrollY, [0, 800], [0, 800 * speed]);
  return (
    <motion.div style={{ y }} className={className}>
      {children}
    </motion.div>
  );
}

/** Horisontell progressbar överst som följer scrollen */
export function ScrollProgress() {
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, { stiffness: 120, damping: 30 });
  return <motion.div aria-hidden className="fixed inset-x-0 top-0 z-[60] h-0.5 origin-left bg-gold" style={{ scaleX }} />;
}

/** En boll som rullar in över skärmen när sektionen syns */
export function RollingBall({ className = "" }: { className?: string }) {
  return (
    <motion.div
      aria-hidden
      className={className}
      initial={{ x: "-20vw", rotate: 0 }}
      whileInView={{ x: "0vw", rotate: 720 }}
      viewport={{ once: true }}
      transition={{ duration: 1.6, ease: [0.22, 1, 0.36, 1] }}
    >
      <Ball />
    </motion.div>
  );
}

export function Ball({ size = 56 }: { size?: number }) {
  return (
    <svg viewBox="0 0 64 64" width={size} height={size}>
      <circle cx="32" cy="32" r="30" fill="#f8fafc" stroke="#0b0b0b" strokeWidth="2" />
      <path d="M32 18 L44 27 L39.5 41 L24.5 41 L20 27 Z" fill="#0b0b0b" />
      <path
        d="M32 18 V4 M44 27 L57 22 M39.5 41 L48 53 M24.5 41 L16 53 M20 27 L7 22"
        stroke="#0b0b0b"
        strokeWidth="2"
        fill="none"
      />
    </svg>
  );
}
