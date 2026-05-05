"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";

interface CountRevealProps {
  totalReplies: number;
  highQualityCount: number;
}

export function CountReveal({ totalReplies, highQualityCount }: CountRevealProps) {
  return (
    <div className="mx-auto mt-12 grid w-full max-w-2xl gap-4 sm:grid-cols-2">
      <StatCard
        value={highQualityCount}
        label="Publish-worthy replies"
        sublabel="Cleared the M4 quality bar"
        delay={0}
        emphasis
      />
      <StatCard
        value={totalReplies}
        label="Total replies ingested"
        sublabel="From Smartlead since M5"
        delay={0.12}
      />
    </div>
  );
}

interface StatCardProps {
  value: number;
  label: string;
  sublabel: string;
  delay: number;
  emphasis?: boolean;
}

function StatCard({ value, label, sublabel, delay, emphasis }: StatCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay, ease: [0.22, 1, 0.36, 1] }}
      className="rounded-card border border-border bg-surface p-6 text-left shadow-card"
    >
      <AnimatedNumber value={value} delay={delay} emphasis={emphasis} />
      <div className="mt-3 text-sm font-medium text-fg">{label}</div>
      <div className="mt-1 text-xs text-fg-subtle">{sublabel}</div>
    </motion.div>
  );
}

function AnimatedNumber({
  value,
  delay,
  emphasis,
}: {
  value: number;
  delay: number;
  emphasis?: boolean;
}) {
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    let raf: number;
    const startDelay = delay * 1000;
    const duration = 1100;
    let startTs: number | null = null;
    function tick(now: number) {
      if (startTs === null) startTs = now;
      const elapsed = now - startTs - startDelay;
      if (elapsed < 0) {
        raf = requestAnimationFrame(tick);
        return;
      }
      const t = Math.min(1, elapsed / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(Math.round(eased * value));
      if (t < 1) raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, delay]);

  return (
    <div
      className={`font-semibold tabular-nums tracking-tight ${
        emphasis ? "text-accent" : "text-fg"
      }`}
    >
      <span className="text-5xl sm:text-6xl">{display}</span>
    </div>
  );
}
