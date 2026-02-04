'use client';

import { useCallback, useState, useRef } from 'react';

interface FileUploadZoneProps {
  label: string;
  description: string;
  accept: string;
  icon: React.ReactNode;
  onFileSelect: (file: File) => void;
  selectedFile?: File | null;
  compact?: boolean;
}

export default function FileUploadZone({
  label,
  description,
  accept,
  icon,
  onFileSelect,
  selectedFile,
  compact = false,
}: FileUploadZoneProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) onFileSelect(file);
    },
    [onFileSelect]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragOver(false);
  }, []);

  return (
    <div
      className={`drop-zone rounded-xl cursor-pointer ${
        isDragOver ? 'drag-over' : ''
      } ${selectedFile ? 'border-green-800/50 bg-green-900/10' : ''} ${
        compact ? 'p-4' : 'p-6'
      }`}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onClick={() => inputRef.current?.click()}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onFileSelect(file);
        }}
      />

      <div className={`flex ${compact ? 'flex-row items-center gap-3' : 'flex-col items-center gap-3'}`}>
        <div
          className={`flex items-center justify-center rounded-lg ${
            compact ? 'w-10 h-10' : 'w-14 h-14'
          } ${
            selectedFile
              ? 'bg-green-900/30 text-green-400'
              : 'bg-[var(--bg-tertiary)] text-[var(--text-muted)]'
          }`}
        >
          {selectedFile ? (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          ) : (
            icon
          )}
        </div>

        <div className={compact ? '' : 'text-center'}>
          <p className={`font-medium ${compact ? 'text-sm' : 'text-base'}`}>
            {selectedFile ? selectedFile.name : label}
          </p>
          {!selectedFile && (
            <p className="text-xs text-[var(--text-muted)] mt-1">{description}</p>
          )}
          {selectedFile && (
            <p className="text-xs text-green-400/70 mt-0.5">
              {(selectedFile.size / 1024).toFixed(1)} KB
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
