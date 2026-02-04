'use client';

import { useState, useEffect, useCallback } from 'react';

interface FileItem {
  name: string;
  path: string;
  type: 'file' | 'folder';
  size?: number;
  modified?: string;
  extension?: string;
  children?: FileItem[];
}

interface FileManagerProps {
  onClose: () => void;
}

function formatSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function formatDate(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleDateString('th-TH', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function FileManager({ onClose }: FileManagerProps) {
  const [tree, setTree] = useState<FileItem[]>([]);
  const [stats, setStats] = useState({ folders: 0, files: 0, totalSize: 0 });
  const [loading, setLoading] = useState(true);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [selectedFile, setSelectedFile] = useState<FileItem | null>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const loadFiles = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/files');
      const data = await res.json();
      if (data.success) {
        setTree(data.tree);
        setStats(data.stats);
      }
    } catch (err) {
      console.error('Failed to load files:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadFiles();
  }, [loadFiles]);

  const toggleFolder = (path: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  const handleDelete = async (item: FileItem) => {
    if (!confirm(`ลบ ${item.type === 'folder' ? 'โฟลเดอร์' : 'ไฟล์'} "${item.name}" หรือไม่?`)) {
      return;
    }

    setDeleting(item.path);
    try {
      const res = await fetch('/api/files', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filePath: item.path }),
      });
      const data = await res.json();
      if (data.success) {
        loadFiles();
        if (selectedFile?.path === item.path) {
          setSelectedFile(null);
          setPreviewImage(null);
        }
      } else {
        alert('ลบไม่สำเร็จ: ' + data.error);
      }
    } catch (err) {
      alert('เกิดข้อผิดพลาด');
    } finally {
      setDeleting(null);
    }
  };

  const handleFileClick = (item: FileItem) => {
    setSelectedFile(item);
    if (item.type === 'file' && ['.png', '.jpg', '.jpeg', '.gif', '.webp'].includes(item.extension || '')) {
      setPreviewImage(`/output/${item.path}`);
    } else {
      setPreviewImage(null);
    }
  };

  const renderItem = (item: FileItem, depth: number = 0) => {
    const isExpanded = expandedFolders.has(item.path);
    const isSelected = selectedFile?.path === item.path;
    const isDeleting = deleting === item.path;
    const isImage = item.type === 'file' && ['.png', '.jpg', '.jpeg', '.gif', '.webp'].includes(item.extension || '');

    return (
      <div key={item.path}>
        <div
          className={`flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-all ${
            isSelected
              ? 'bg-[var(--accent)]/20 text-[var(--accent-light)]'
              : 'hover:bg-[var(--bg-tertiary)]'
          } ${isDeleting ? 'opacity-50' : ''}`}
          style={{ paddingLeft: `${12 + depth * 20}px` }}
          onClick={() => {
            if (item.type === 'folder') {
              toggleFolder(item.path);
            } else {
              handleFileClick(item);
            }
          }}
        >
          {/* Icon */}
          {item.type === 'folder' ? (
            <span className="text-yellow-400">
              {isExpanded ? '📂' : '📁'}
            </span>
          ) : isImage ? (
            <span>🖼️</span>
          ) : (
            <span>📄</span>
          )}

          {/* Name */}
          <span className="flex-1 truncate text-sm">{item.name}</span>

          {/* Size */}
          {item.type === 'file' && item.size !== undefined && (
            <span className="text-xs text-[var(--text-muted)]">{formatSize(item.size)}</span>
          )}

          {/* Children count */}
          {item.type === 'folder' && item.children && (
            <span className="text-xs text-[var(--text-muted)]">
              {item.children.length} items
            </span>
          )}

          {/* Delete button */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleDelete(item);
            }}
            disabled={isDeleting}
            className="p-1 rounded text-red-400/60 hover:text-red-400 hover:bg-red-900/20 transition opacity-0 group-hover:opacity-100"
            style={{ opacity: isSelected ? 1 : undefined }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            </svg>
          </button>
        </div>

        {/* Children */}
        {item.type === 'folder' && isExpanded && item.children && (
          <div>
            {item.children.map((child) => renderItem(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
      <div className="bg-[var(--bg-secondary)] rounded-2xl border border-[var(--border)] w-full max-w-5xl max-h-[85vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border)]">
          <div className="flex items-center gap-3">
            <span className="text-xl">📂</span>
            <div>
              <h2 className="text-lg font-semibold">File Manager</h2>
              <p className="text-xs text-[var(--text-muted)]">
                {stats.folders} folders, {stats.files} files ({formatSize(stats.totalSize)})
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={loadFiles}
              className="px-3 py-2 rounded-lg bg-[var(--bg-tertiary)] text-sm hover:bg-[var(--bg-elevated)] transition"
            >
              🔄 Refresh
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-[var(--bg-tertiary)] transition"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 flex overflow-hidden">
          {/* File Tree */}
          <div className="w-1/2 border-r border-[var(--border)] overflow-y-auto p-4">
            {loading ? (
              <div className="flex items-center justify-center h-32">
                <div className="animate-spin w-8 h-8 border-2 border-[var(--accent)] border-t-transparent rounded-full" />
              </div>
            ) : tree.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-4xl mb-3">📭</p>
                <p className="text-[var(--text-muted)]">ยังไม่มีไฟล์</p>
                <p className="text-xs text-[var(--text-muted)] mt-1">
                  รัน Pipeline เพื่อสร้างไฟล์
                </p>
              </div>
            ) : (
              <div className="space-y-1">
                {tree.map((item) => renderItem(item))}
              </div>
            )}
          </div>

          {/* Preview Panel */}
          <div className="w-1/2 overflow-y-auto p-4">
            {selectedFile ? (
              <div className="space-y-4">
                {/* File Info */}
                <div className="p-4 rounded-xl bg-[var(--bg-primary)] border border-[var(--border)]">
                  <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
                    {selectedFile.type === 'folder' ? '📁' : '📄'} {selectedFile.name}
                  </h3>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-[var(--text-muted)]">Path:</span>
                      <span className="font-mono text-xs">{selectedFile.path}</span>
                    </div>
                    {selectedFile.size !== undefined && (
                      <div className="flex justify-between">
                        <span className="text-[var(--text-muted)]">Size:</span>
                        <span>{formatSize(selectedFile.size)}</span>
                      </div>
                    )}
                    {selectedFile.modified && (
                      <div className="flex justify-between">
                        <span className="text-[var(--text-muted)]">Modified:</span>
                        <span>{formatDate(selectedFile.modified)}</span>
                      </div>
                    )}
                    {selectedFile.extension && (
                      <div className="flex justify-between">
                        <span className="text-[var(--text-muted)]">Type:</span>
                        <span>{selectedFile.extension.toUpperCase()}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Image Preview */}
                {previewImage && (
                  <div className="space-y-2">
                    <h4 className="text-xs font-medium text-[var(--text-muted)] uppercase">Preview</h4>
                    <div
                      className="rounded-xl overflow-hidden border border-[var(--border)] bg-[url('data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2220%22%20height%3D%2220%22%3E%3Crect%20width%3D%2210%22%20height%3D%2210%22%20fill%3D%22%23333%22%2F%3E%3Crect%20x%3D%2210%22%20y%3D%2210%22%20width%3D%2210%22%20height%3D%2210%22%20fill%3D%22%23333%22%2F%3E%3Crect%20x%3D%2210%22%20width%3D%2210%22%20height%3D%2210%22%20fill%3D%22%23555%22%2F%3E%3Crect%20y%3D%2210%22%20width%3D%2210%22%20height%3D%2210%22%20fill%3D%22%23555%22%2F%3E%3C%2Fsvg%3E')]"
                    >
                      <img
                        src={previewImage}
                        alt={selectedFile.name}
                        className="w-full h-auto max-h-[400px] object-contain"
                      />
                    </div>
                    <a
                      href={previewImage}
                      download={selectedFile.name}
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--accent)]/15 text-[var(--accent-light)] text-sm hover:bg-[var(--accent)]/25 transition"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                        <polyline points="7 10 12 15 17 10" />
                        <line x1="12" y1="15" x2="12" y2="3" />
                      </svg>
                      Download
                    </a>
                  </div>
                )}

                {/* Delete Button */}
                <button
                  onClick={() => handleDelete(selectedFile)}
                  disabled={deleting === selectedFile.path}
                  className="w-full px-4 py-2.5 rounded-lg bg-red-600/20 text-red-400 text-sm font-medium hover:bg-red-600/30 transition flex items-center justify-center gap-2"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                  </svg>
                  Delete {selectedFile.type === 'folder' ? 'Folder' : 'File'}
                </button>
              </div>
            ) : (
              <div className="flex items-center justify-center h-full">
                <div className="text-center">
                  <p className="text-4xl mb-3">👈</p>
                  <p className="text-[var(--text-muted)]">เลือกไฟล์เพื่อดู Preview</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
