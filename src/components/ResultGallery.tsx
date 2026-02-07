'use client';

import { useState } from 'react';

interface ResultItem {
  itemName: string;
  step1Image?: string;
  step2Image?: string;
  step3Image?: string;
  step4Image?: string;
  savedPath?: string;
  error?: string;
}

interface ResultGalleryProps {
  results: ResultItem[];
}

export default function ResultGallery({ results }: ResultGalleryProps) {
  const [selectedItem, setSelectedItem] = useState<number>(0);
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);

  if (results.length === 0) return null;

  const current = results[selectedItem];

  const ImageBox = ({ image, label, pending = 'Pending', showTransparent = false }: { image?: string; label: string; pending?: string; showTransparent?: boolean }) => (
    <div className="space-y-2">
      <h4 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">{label}</h4>
      {image ? (
        <div
          className={`aspect-square rounded-lg overflow-hidden cursor-pointer card-hover ${showTransparent ? 'bg-[url("data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2220%22%20height%3D%2220%22%3E%3Crect%20width%3D%2210%22%20height%3D%2210%22%20fill%3D%22%23333%22%2F%3E%3Crect%20x%3D%2210%22%20y%3D%2210%22%20width%3D%2210%22%20height%3D%2210%22%20fill%3D%22%23333%22%2F%3E%3Crect%20x%3D%2210%22%20width%3D%2210%22%20height%3D%2210%22%20fill%3D%22%23555%22%2F%3E%3Crect%20y%3D%2210%22%20width%3D%2210%22%20height%3D%2210%22%20fill%3D%22%23555%22%2F%3E%3C%2Fsvg%3E")]' : 'bg-[var(--bg-tertiary)]'}`}
          onClick={() => setLightboxImage(image)}
        >
          <img src={image} alt={label} className="w-full h-full object-cover" />
        </div>
      ) : (
        <div className="aspect-square rounded-lg bg-[var(--bg-tertiary)] flex items-center justify-center">
          <span className="text-[var(--text-muted)] text-sm">{pending}</span>
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-4">
      {results.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-2">
          {results.map((item, idx) => (
            <button
              key={idx}
              onClick={() => setSelectedItem(idx)}
              className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap ${idx === selectedItem ? 'bg-[var(--accent)]/15 text-[var(--accent-light)] ring-1 ring-[var(--accent)]/30' : item.error ? 'bg-red-900/10 text-red-400/70' : 'bg-[var(--bg-tertiary)] text-[var(--text-muted)]'}`}
            >
              {item.itemName}
            </button>
          ))}
        </div>
      )}

      {current && (
        <div className="space-y-4">
          {current.error && <div className="p-4 rounded-lg bg-red-900/10 border border-red-800/30 text-red-400 text-sm">Error: {current.error}</div>}

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <ImageBox image={current.step1Image} label="1️⃣ Generated" />
            <ImageBox image={current.step2Image} label="2️⃣ Dressed" pending="Skipped" />
            <ImageBox image={current.step3Image} label="3️⃣ Mask" />
            <ImageBox image={current.step4Image} label="4️⃣ Extracted" />
          </div>

          {current.savedPath && (
            <div className="p-3 rounded-lg bg-green-900/10 border border-green-800/30">
              <p className="text-sm text-green-400">💾 <strong>Saved:</strong> <code className="font-mono">{current.savedPath}</code></p>
            </div>
          )}
        </div>
      )}

      {lightboxImage && (
        <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-8" onClick={() => setLightboxImage(null)}>
          <div className="relative max-w-4xl max-h-[90vh]">
            <img src={lightboxImage} alt="Full" className="max-w-full max-h-[90vh] object-contain rounded-lg" />
            <button onClick={() => setLightboxImage(null)} className="absolute -top-4 -right-4 w-10 h-10 rounded-full bg-[var(--bg-elevated)] flex items-center justify-center text-white">✕</button>
          </div>
        </div>
      )}
    </div>
  );
}
