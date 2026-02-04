'use client';

import { useState, useRef } from 'react';

export interface ImageItem {
  id: string;
  url: string;
  name: string;
  filePath?: string;
}

interface DraggableImageListProps {
  images: ImageItem[];
  onReorder: (images: ImageItem[]) => void;
  onRemove: (id: string) => void;
  onAdd: (files: FileList) => void;
  label: string;
  accept?: string;
}

export default function DraggableImageList({
  images,
  onReorder,
  onRemove,
  onAdd,
  label,
  accept = 'image/*',
}: DraggableImageListProps) {
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragStart = (e: React.DragEvent, id: string) => {
    setDraggedId(id);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, id: string) => {
    e.preventDefault();
    if (id !== draggedId) {
      setDragOverId(id);
    }
  };

  const handleDragLeave = () => {
    setDragOverId(null);
  };

  const handleDrop = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    setDragOverId(null);

    if (!draggedId || draggedId === targetId) {
      setDraggedId(null);
      return;
    }

    const newImages = [...images];
    const draggedIndex = newImages.findIndex((img) => img.id === draggedId);
    const targetIndex = newImages.findIndex((img) => img.id === targetId);

    if (draggedIndex !== -1 && targetIndex !== -1) {
      const [removed] = newImages.splice(draggedIndex, 1);
      newImages.splice(targetIndex, 0, removed);
      onReorder(newImages);
    }

    setDraggedId(null);
  };

  const handleDragEnd = () => {
    setDraggedId(null);
    setDragOverId(null);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      onAdd(e.target.files);
      e.target.value = '';
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider">
          {label}
          {images.length > 0 && (
            <span className="ml-2 text-[var(--accent-light)]">({images.length} รูป)</span>
          )}
        </label>
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="px-3 py-1.5 text-xs font-medium rounded-lg bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] transition flex items-center gap-1.5"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          เพิ่มรูป
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept={accept}
          multiple
          className="hidden"
          onChange={handleFileSelect}
        />
      </div>

      {images.length === 0 ? (
        <div
          onClick={() => fileInputRef.current?.click()}
          className="border-2 border-dashed border-[var(--border)] rounded-xl p-8 text-center cursor-pointer hover:border-[var(--accent)]/50 hover:bg-[var(--accent)]/5 transition"
        >
          <svg
            className="w-10 h-10 mx-auto mb-3 text-[var(--text-muted)]"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          >
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <polyline points="21 15 16 10 5 21" />
          </svg>
          <p className="text-sm text-[var(--text-muted)]">คลิกเพื่อเพิ่มรูป Reference</p>
          <p className="text-xs text-[var(--text-muted)]/60 mt-1">รองรับหลายรูป, ลากเพื่อเรียงลำดับ</p>
        </div>
      ) : (
        <div className="flex flex-wrap gap-3">
          {images.map((img, index) => (
            <div
              key={img.id}
              draggable
              onDragStart={(e) => handleDragStart(e, img.id)}
              onDragOver={(e) => handleDragOver(e, img.id)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, img.id)}
              onDragEnd={handleDragEnd}
              className={`
                relative group w-24 h-24 rounded-lg overflow-hidden cursor-grab active:cursor-grabbing
                transition-all duration-200 ring-2
                ${draggedId === img.id ? 'opacity-50 scale-95' : ''}
                ${dragOverId === img.id ? 'ring-[var(--accent)] scale-105' : 'ring-transparent'}
              `}
            >
              {/* Order badge */}
              <div className="absolute top-1 left-1 z-10 w-5 h-5 rounded-full bg-black/70 text-white text-xs font-bold flex items-center justify-center">
                {index + 1}
              </div>

              {/* Remove button */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onRemove(img.id);
                }}
                className="absolute top-1 right-1 z-10 w-5 h-5 rounded-full bg-red-600/80 text-white opacity-0 group-hover:opacity-100 transition flex items-center justify-center"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>

              {/* Drag handle indicator */}
              <div className="absolute bottom-1 left-1/2 -translate-x-1/2 z-10 opacity-0 group-hover:opacity-100 transition">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" className="text-white drop-shadow">
                  <circle cx="9" cy="6" r="1.5" />
                  <circle cx="15" cy="6" r="1.5" />
                  <circle cx="9" cy="12" r="1.5" />
                  <circle cx="15" cy="12" r="1.5" />
                  <circle cx="9" cy="18" r="1.5" />
                  <circle cx="15" cy="18" r="1.5" />
                </svg>
              </div>

              <img
                src={img.url}
                alt={img.name}
                className="w-full h-full object-cover"
                draggable={false}
              />

              {/* Hover overlay */}
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition" />
            </div>
          ))}

          {/* Add more button */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="w-24 h-24 rounded-lg border-2 border-dashed border-[var(--border)] flex flex-col items-center justify-center text-[var(--text-muted)] hover:border-[var(--accent)]/50 hover:text-[var(--accent-light)] transition"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            <span className="text-xs mt-1">เพิ่ม</span>
          </button>
        </div>
      )}

      {images.length > 1 && (
        <p className="text-xs text-[var(--text-muted)]">
          💡 ลากรูปเพื่อเรียงลำดับ — รูปแรกจะถูกส่งก่อน
        </p>
      )}
    </div>
  );
}
