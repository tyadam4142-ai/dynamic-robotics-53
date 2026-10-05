import React, { useEffect, useRef, useState } from 'react';
import { motion, useScroll, useSpring } from 'motion/react';

/** Fades + slides content in when it scrolls into view. */
export const Reveal: React.FC<{ children: React.ReactNode; delay?: number; y?: number; className?: string }> = ({
  children, delay = 0, y = 32, className,
}) => (
  <motion.div
    className={className}
    initial={{ opacity: 0, y }}
    whileInView={{ opacity: 1, y: 0 }}
    viewport={{ once: true, margin: '-60px' }}
    transition={{ duration: 0.7, delay, ease: [0.2, 0.8, 0.2, 1] }}
  >
    {children}
  </motion.div>
);

/** Thin gold progress bar at the top of the page. */
export const ScrollProgress: React.FC = () => {
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, { stiffness: 120, damping: 24 });
  return (
    <motion.div
      style={{ scaleX, transformOrigin: '0% 50%' }}
      className="fixed top-0 left-0 right-0 h-[3px] z-[60] bg-gradient-to-r from-[#c99a2e] via-[#f1ca62] to-white"
    />
  );
};

/** Soft gold spotlight that follows the mouse (desktop only). */
export const CursorGlow: React.FC = () => {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (window.matchMedia('(hover: none)').matches) return;
    const move = (e: MouseEvent) => {
      if (ref.current) ref.current.style.transform = `translate(${e.clientX - 200}px, ${e.clientY - 200}px)`;
    };
    window.addEventListener('mousemove', move);
    return () => window.removeEventListener('mousemove', move);
  }, []);
  return (
    <div
      ref={ref}
      className="fixed top-0 left-0 w-[400px] h-[400px] rounded-full pointer-events-none -z-10 hidden md:block"
      style={{ background: 'radial-gradient(circle, rgba(241,202,98,0.10), transparent 65%)' }}
    />
  );
};

/** 3D tilt-on-hover wrapper. */
export const Tilt: React.FC<{ children: React.ReactNode; className?: string; max?: number }> = ({ children, className = '', max = 8 }) => {
  const ref = useRef<HTMLDivElement>(null);
  const onMove = (e: React.MouseEvent) => {
    const el = ref.current; if (!el) return;
    const b = el.getBoundingClientRect();
    const x = (e.clientX - b.left) / b.width - 0.5;
    const y = (e.clientY - b.top) / b.height - 0.5;
    el.style.transform = `perspective(900px) rotateY(${x * max}deg) rotateX(${-y * max}deg) translateZ(0)`;
  };
  const reset = () => { if (ref.current) ref.current.style.transform = ''; };
  return <div ref={ref} onMouseMove={onMove} onMouseLeave={reset} className={`tilt ${className}`}>{children}</div>;
};

/** Number that counts up when first seen. */
export const CountUp: React.FC<{ to: number; prefix?: string; suffix?: string }> = ({ to, prefix = '', suffix = '' }) => {
  const [n, setN] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const io = new IntersectionObserver(([en]) => {
      if (!en.isIntersecting) return;
      io.disconnect();
      const t0 = performance.now();
      const tick = (t: number) => {
        const p = Math.min((t - t0) / 1200, 1);
        setN(Math.round(to * (1 - Math.pow(1 - p, 3))));
        if (p < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    io.observe(el);
    return () => io.disconnect();
  }, [to]);
  return <span ref={ref}>{prefix}{n.toLocaleString('en-IN')}{suffix}</span>;
};
