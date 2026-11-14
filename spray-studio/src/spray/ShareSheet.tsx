/**
 * After saving: the share link and its QR code (opens the viewer with this painting on any phone),
 * next to a preview of the painting. In kiosk mode this is what a visitor scans to take it home.
 */
import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Check, Copy, Download, ExternalLink, SprayCan, X } from 'lucide-react';
import type { SavedCreation } from './creation';

export const ShareSheet: React.FC<{ creation: SavedCreation | null; onClose: () => void; onNew: () => void }> = ({
  creation,
  onClose,
  onNew,
}) => {
  const [copied, setCopied] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!creation) return;
    setCopied(false);
    closeRef.current?.focus();
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [creation, onClose]);

  const copy = () => {
    if (!creation) return;
    navigator.clipboard?.writeText(creation.url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };
  const download = () => {
    if (!creation) return;
    const a = document.createElement('a');
    a.download = `spray-bobo-${creation.id}.png`;
    a.href = `/evade/spray-bobo/view/index.html?c=${creation.id}`;
    // the viewer makes the finished artwork; here: the raw painting on its print
    const c = document.createElement('canvas');
    c.width = 768;
    c.height = 1024;
    const g = c.getContext('2d')!;
    const print = new Image();
    print.onload = () => {
      g.drawImage(print, 0, 0, 768, 1024);
      g.drawImage(creation.image, 0, 0);
      a.href = c.toDataURL('image/png');
      a.click();
    };
    print.src = creation.paintable.files.print;
  };

  return (
    <AnimatePresence>
      {creation && (
        <motion.div
          className="fixed inset-0 z-[70] grid place-items-center bg-[#0f1519]/80 p-4 backdrop-blur-md"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="share-title"
          onPointerDown={(e) => e.target === e.currentTarget && onClose()}
        >
          <motion.div
            initial={{ y: 24, scale: 0.96 }}
            animate={{ y: 0, scale: 1 }}
            exit={{ y: 24, scale: 0.96 }}
            transition={{ type: 'spring', stiffness: 320, damping: 28 }}
            className="relative flex w-full max-w-3xl flex-col gap-6 rounded-[28px] border border-white/15 bg-[#15131a] p-6 shadow-2xl md:flex-row md:p-8"
          >
            <button
              ref={closeRef}
              onClick={onClose}
              aria-label="Close"
              className="tap absolute right-4 top-4 grid size-11 place-items-center rounded-full border border-white/15 bg-white/5 text-white/80"
            >
              <X size={18} />
            </button>

            <div className="mx-auto w-full max-w-[260px] shrink-0 md:mx-0">
              <iframe
                title="Your painting, as others will see it"
                src={`/evade/spray-bobo/view/index.html?c=${creation.id}&embed=1`}
                className="aspect-[3/4] w-full rounded-2xl border border-white/10 bg-[#0f1519]"
              />
            </div>

            <div className="flex min-w-0 flex-1 flex-col">
              <h2 id="share-title" className="font-display text-4xl leading-none text-[#f6c344]" style={{ fontFamily: '"Permanent Marker", cursive' }}>
                Fresh!
              </h2>
              <p className="mt-2 text-sm text-white/70">
                Scan to open your painting on your phone. Keep it, share it, or see it on your {creation.paintable.client} merch.
              </p>
              <div className="mt-5 flex items-center gap-5">
                <img
                  src={`/api/spray/qr?id=${creation.id}`}
                  alt="QR code that opens this painting"
                  className="size-40 shrink-0 rounded-2xl bg-white p-2"
                />
                <div className="min-w-0 flex-1">
                  <div className="mono-caps text-[10px] text-white/45">Share link</div>
                  <div className="mt-1 break-all font-mono text-sm text-white">{creation.url.replace(/^https?:\/\//, '')}</div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button onClick={copy} className="tap inline-flex h-11 items-center gap-2 rounded-full border border-white/20 bg-white/5 px-4 text-sm font-semibold text-white">
                      {copied ? <Check size={15} /> : <Copy size={15} />}
                      {copied ? 'Copied' : 'Copy link'}
                    </button>
                    <a
                      href={creation.url}
                      target="_blank"
                      rel="noreferrer"
                      className="tap inline-flex h-11 items-center gap-2 rounded-full border border-white/20 bg-white/5 px-4 text-sm font-semibold text-white"
                    >
                      <ExternalLink size={15} />
                      Open
                    </a>
                    <button onClick={download} className="tap inline-flex h-11 items-center gap-2 rounded-full border border-white/20 bg-white/5 px-4 text-sm font-semibold text-white">
                      <Download size={15} />
                      Image
                    </button>
                  </div>
                </div>
              </div>
              <div className="mt-auto flex flex-wrap gap-3 pt-6">
                <button onClick={onNew} className="tap inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-full bg-[#f6c344] px-6 text-sm font-bold text-[#15131a]">
                  <SprayCan size={16} />
                  Paint another
                </button>
                <button onClick={onClose} className="tap inline-flex h-12 items-center justify-center rounded-full border border-white/20 px-6 text-sm font-semibold text-white">
                  Keep painting
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
