"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useI18n } from "@/lib/i18n";

export type GuideStep = {
  /** CSS selector of the element to spotlight. Omit for a centered card. */
  target?: string;
  title: string;
  body: string;
  /** The "why it works this way" line. */
  why?: string;
};

type Rect = { top: number; left: number; width: number; height: number; bottom: number };

/**
 * Dependency-free guided tour: dims the page, cuts a hole around the target and
 * walks the user through it. Steps whose target is not on screen are skipped, so
 * the same list works in every arena state.
 */
export default function Guide({
  steps,
  open,
  onClose,
  storageKey,
}: {
  steps: GuideStep[];
  open: boolean;
  onClose: () => void;
  storageKey: string;
}) {
  const [idx, setIdx] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const [mounted, setMounted] = useState(false);
  const { c } = useI18n();

  // Stable signature: the parent can pass a fresh array on every render.
  const signature = useMemo(() => steps.map((s) => `${s.target ?? "-"}:${s.title}`).join("|"), [steps]);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    setIdx(0);
  }, [open, signature]);

  const step = steps[idx];
  const target = step?.target;

  const finish = useCallback(
    (dismissed = false) => {
      try {
        window.localStorage.setItem(storageKey, dismissed ? "dismissed" : "done");
      } catch {
        /* private mode */
      }
      onClose();
    },
    [storageKey, onClose],
  );

  const measure = useCallback(() => {
    if (!target) {
      setRect(null);
      return;
    }
    const el = document.querySelector(target);
    if (!el) {
      setRect(null);
      return;
    }
    const r = el.getBoundingClientRect();
    setRect({ top: r.top, left: r.left, width: r.width, height: r.height, bottom: r.bottom });
  }, [target]);

  // Scroll the target into view, then keep the hole aligned while the page moves.
  useEffect(() => {
    if (!open || !target) return;
    const el = document.querySelector(target);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
    const timers = [80, 320, 700].map((ms) => window.setTimeout(measure, ms));
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      timers.forEach((t) => window.clearTimeout(t));
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [open, target, idx, measure]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") finish();
      if (e.key === "ArrowRight") setIdx((v) => Math.min(steps.length - 1, v + 1));
      if (e.key === "ArrowLeft") setIdx((v) => Math.max(0, v - 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, steps.length, finish]);

  if (!mounted || !open || !step) return null;

  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const tipW = Math.min(420, vw - 28);
  const pad = 8;
  const below = !rect || rect.bottom < vh * 0.5;
  const top = rect
    ? below
      ? Math.min(vh - 250, rect.bottom + pad + 14)
      : Math.max(14, rect.top - pad - 300)
    : Math.max(14, vh / 2 - 150);
  const left = rect
    ? Math.max(14, Math.min(vw - tipW - 14, rect.left + rect.width / 2 - tipW / 2))
    : Math.max(14, vw / 2 - tipW / 2);

  return createPortal(
    <div className="guide-root" role="dialog" aria-modal="true" aria-label={c.guideUi.aria}>
      {rect ? (
        <div
          className="guide-hole"
          style={{
            top: rect.top - pad,
            left: rect.left - pad,
            width: rect.width + pad * 2,
            height: rect.height + pad * 2,
          }}
        />
      ) : (
        <div className="guide-veil" />
      )}

      <div className="guide-card" style={{ top, left, width: tipW }} onClick={(e) => e.stopPropagation()}>
        <div className="guide-meta">
          <span className="guide-step">{c.guideUi.stepOf(idx + 1, steps.length)}</span>
          <button className="guide-skip" onClick={() => finish(true)}>
            {c.guideUi.skip}
          </button>
        </div>

        <div className="guide-text" key={idx}>
          <div className="guide-title">{step.title}</div>
          <p className="guide-body">{step.body}</p>
          {step.why && (
            <p className="guide-why">
              <b>{c.guideUi.why}</b> {step.why}
            </p>
          )}
        </div>

        <div className="guide-actions">
          <button className="guide-back" disabled={idx === 0} onClick={() => setIdx((v) => Math.max(0, v - 1))}>
            {c.guideUi.back}
          </button>
          <div className="guide-dots">
            {steps.map((s, i) => (
              <span key={`${s.title}-${i}`} className={`guide-dot ${i === idx ? "on" : ""}`} />
            ))}
          </div>
          {idx === steps.length - 1 ? (
            <button className="guide-next" onClick={() => finish(false)}>
              {c.guideUi.gotIt}
            </button>
          ) : (
            <button className="guide-next" onClick={() => setIdx((v) => Math.min(steps.length - 1, v + 1))}>
              {c.guideUi.next}
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
