'use client';

import { useState, useCallback, useRef } from 'react';
import FileUploadZone from '@/components/FileUploadZone';
import StepIndicator from '@/components/StepIndicator';
import LogPanel, { LogEntry } from '@/components/LogPanel';
import ResultGallery from '@/components/ResultGallery';
import DraggableImageList, { ImageItem } from '@/components/DraggableImageList';
import FileManager from '@/components/FileManager';

interface SheetInfo {
  name: string;
  columns: string[];
  rowCount: number;
  preview: Record<string, string>[];
}

interface ResultItem {
  itemName: string;
  step1Image?: string;
  step2Image?: string;
  step3Image?: string;
  step4Image?: string;
  savedPath?: string;
  error?: string;
}

const SHEET_PROMPT = 'Prompt to gen data';
const SHEET_CATEGORY = 'Woman-Category, Sub Category an';

// Default images from public/images/
const DEFAULT_STEP2_IMAGES: ImageItem[] = [
  { id: 'default-1', url: '/images/model-1.png', name: 'model-1.png', filePath: './public/images/model-1.png' },
  { id: 'default-2', url: '/images/model-2.png', name: 'model-2.png', filePath: './public/images/model-2.png' },
  { id: 'default-3', url: '/images/model-3.png', name: 'model-3.png', filePath: './public/images/model-3.png' },
];

const DEFAULT_STEP3_IMAGES: ImageItem[] = [
  { id: 'default-ref-1', url: '/images/model-1.png', name: 'model-1.png', filePath: './public/images/model-1.png' },
];

export default function HomePage() {
  const [excelFile, setExcelFile] = useState<File | null>(null);
  const [excelPath, setExcelPath] = useState('');
  const [sheets, setSheets] = useState<SheetInfo[]>([]);

  // Step configs with defaults
  const [step1Sheet, setStep1Sheet] = useState(SHEET_PROMPT);
  const [step1PromptCol, setStep1PromptCol] = useState('');

  const [step2Sheet, setStep2Sheet] = useState(SHEET_CATEGORY);
  const [step2PromptCol, setStep2PromptCol] = useState('');
  const [step2VariableCol, setStep2VariableCol] = useState('');
  const [step2Images, setStep2Images] = useState<ImageItem[]>(DEFAULT_STEP2_IMAGES);

  const [step3Sheet, setStep3Sheet] = useState(SHEET_CATEGORY);
  const [step3PromptCol, setStep3PromptCol] = useState('');
  const [step3Images, setStep3Images] = useState<ImageItem[]>(DEFAULT_STEP3_IMAGES);

  const [step4Sheet, setStep4Sheet] = useState(SHEET_CATEGORY);
  const [step4PromptCol, setStep4PromptCol] = useState('');
  const [step4VariableCol, setStep4VariableCol] = useState('');

  const [step5Sheet, setStep5Sheet] = useState(SHEET_PROMPT);
  const [step5FolderCol, setStep5FolderCol] = useState('');
  const [step5FileCol, setStep5FileCol] = useState('');
  const [step5BasePath, setStep5BasePath] = useState('./public/output');

  const [imageGenModel, setImageGenModel] = useState('google/gemini-2.5-flash-image');
  const [visionModel, setVisionModel] = useState('google/gemini-2.5-flash');

  const [rowMode, setRowMode] = useState<'all' | 'range' | 'count'>('count');
  const [rowStart, setRowStart] = useState(1);
  const [rowEnd, setRowEnd] = useState(10);
  const [rowCount, setRowCount] = useState(5);

  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [results, setResults] = useState<ResultItem[]>([]);
  const [pipelineSteps, setPipelineSteps] = useState<{ label: string; description: string; status: 'pending' | 'active' | 'complete' | 'error' }[]>([
    { label: 'Generate', description: 'Create', status: 'pending' },
    { label: 'Dress', description: 'Put on Model', status: 'pending' },
    { label: 'Extract', description: 'Remove BG', status: 'pending' },
    { label: 'Final', description: 'Ready', status: 'pending' },
    { label: 'Save', description: 'Auto Save', status: 'pending' },
  ]);

  const [showSettings, setShowSettings] = useState(false);
  const [showFileManager, setShowFileManager] = useState(false);
  const [activeTab, setActiveTab] = useState<'step1' | 'step2' | 'step3' | 'step4' | 'step5'>('step1');
  const abortRef = useRef<AbortController | null>(null);

  const addLog = useCallback((type: LogEntry['type'], message: string) => {
    setLogs((prev) => [...prev, { id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`, timestamp: new Date(), type, message }]);
  }, []);

  const uploadFile = async (file: File, type: string): Promise<any> => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('type', type);
    const res = await fetch('/api/upload', { method: 'POST', body: formData });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Upload failed');
    return data;
  };

  const findColByLetter = (columns: string[], letter: string): string => {
    // Find column that starts with "X: " where X is the letter
    const col = columns.find(c => c.startsWith(`${letter.toUpperCase()}:`));
    return col || '';
  };

  const handleExcelUpload = async (file: File) => {
    setExcelFile(file);
    addLog('info', `Uploading: ${file.name}`);
    try {
      const data = await uploadFile(file, 'excel');
      setExcelPath(data.filePath);
      setSheets(data.sheets || []);

      const promptSheet = data.sheets?.find((s: SheetInfo) => s.name === SHEET_PROMPT);
      const categorySheet = data.sheets?.find((s: SheetInfo) => s.name === SHEET_CATEGORY);

      if (promptSheet) {
        setStep1Sheet(promptSheet.name);
        setStep1PromptCol(findColByLetter(promptSheet.columns, 'E'));
        setStep5Sheet(promptSheet.name);
        setStep5FolderCol(findColByLetter(promptSheet.columns, 'D'));
        setStep5FileCol(findColByLetter(promptSheet.columns, 'A'));
        addLog('success', `✓ "${SHEET_PROMPT}" found - auto-selected E, D, A`);
      }

      if (categorySheet) {
        setStep2Sheet(categorySheet.name);
        setStep2PromptCol(findColByLetter(categorySheet.columns, 'G'));
        setStep2VariableCol(findColByLetter(categorySheet.columns, 'E'));
        setStep3Sheet(categorySheet.name);
        setStep3PromptCol(findColByLetter(categorySheet.columns, 'J'));
        setStep4Sheet(categorySheet.name);
        setStep4PromptCol(findColByLetter(categorySheet.columns, 'I'));
        setStep4VariableCol(findColByLetter(categorySheet.columns, 'E'));
        addLog('success', `✓ "${SHEET_CATEGORY}" found - auto-selected G, E, J, I`);
      }

      addLog('success', `Loaded ${data.sheets?.length || 0} sheets`);
    } catch (err: any) {
      addLog('error', `Failed: ${err.message}`);
    }
  };

  const handleStep2ImagesUpload = async (files: FileList) => {
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      try {
        const data = await uploadFile(file, 'mannequin');
        const url = URL.createObjectURL(file);
        setStep2Images((prev) => [...prev, { id: `${Date.now()}-${i}`, url, name: file.name, filePath: data.filePath }]);
        addLog('success', `Step 2 image: ${file.name}`);
      } catch (err: any) { addLog('error', err.message); }
    }
  };

  const handleStep3ImagesUpload = async (files: FileList) => {
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      try {
        const data = await uploadFile(file, 'reference');
        const url = URL.createObjectURL(file);
        setStep3Images((prev) => [...prev, { id: `${Date.now()}-${i}`, url, name: file.name, filePath: data.filePath }]);
        addLog('success', `Step 3 reference: ${file.name}`);
      } catch (err: any) { addLog('error', err.message); }
    }
  };

  const getSheetByName = (name: string) => sheets.find((s) => s.name === name);

  const startPipeline = async () => {
    if (!excelPath || !step1PromptCol) { addLog('error', 'Upload Excel and configure Step 1'); return; }

    setIsProcessing(true);
    setProgress(0);
    setResults([]);
    setPipelineSteps((prev) => prev.map((s) => ({ ...s, status: 'pending' })));
    addLog('info', '🚀 Starting pipeline...');
    abortRef.current = new AbortController();

    try {
      const response = await fetch('/api/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          excelPath, imageGenModel, visionModel,
          step1Sheet, step1PromptCol,
          step2Sheet, step2PromptCol, step2VariableCol, step2Images: step2Images.map((img) => img.filePath),
          step3Sheet, step3PromptCol, step3Images: step3Images.map((img) => img.filePath),
          step4Sheet, step4PromptCol, step4VariableCol,
          step5Sheet, step5FolderCol, step5FileCol, step5BasePath,
          rowMode, rowStart, rowEnd, rowCount,
        }),
        signal: abortRef.current.signal,
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const reader = response.body?.getReader();
      if (!reader) throw new Error('No stream');

      const decoder = new TextDecoder();
      let buffer = '';
      const currentResults: Map<number, ResultItem> = new Map();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const data = JSON.parse(line.substring(6));
            switch (data.type) {
              case 'progress': setProgress(data.progress || 0); addLog('info', data.message); break;
              case 'item_start': currentResults.set(data.itemIndex, { itemName: data.itemName }); addLog('step', data.message); break;
              case 'step_start': addLog('info', data.message); setPipelineSteps((prev) => prev.map((s, i) => i === data.step - 1 ? { ...s, status: 'active' } : s)); break;
              case 'step_complete': {
                const item = currentResults.get(data.itemIndex) || { itemName: `Item ${data.itemIndex + 1}` };
                if (data.step === 1) item.step1Image = data.imageUrl;
                if (data.step === 2) item.step2Image = data.imageUrl;
                if (data.step === 3) item.step3Image = data.imageUrl;
                if (data.step === 4) item.step4Image = data.imageUrl;
                if (data.step === 5) item.savedPath = data.savedPath;
                currentResults.set(data.itemIndex, item);
                setResults(Array.from(currentResults.values()));
                setProgress(data.progress || 0);
                addLog('success', data.message);
                setPipelineSteps((prev) => prev.map((s, i) => i === data.step - 1 ? { ...s, status: 'complete' } : s));
                break;
              }
              case 'step_skip': addLog('warning', data.message); break;
              case 'item_complete': addLog('success', data.message); setPipelineSteps((prev) => prev.map((s) => ({ ...s, status: 'pending' }))); break;
              case 'item_error': { const item = currentResults.get(data.itemIndex) || { itemName: `Item ${data.itemIndex + 1}` }; item.error = data.error; currentResults.set(data.itemIndex, item); setResults(Array.from(currentResults.values())); addLog('error', data.message); break; }
              case 'error': addLog('error', data.message); break;
              case 'done': setProgress(100); addLog('success', data.message); setPipelineSteps((prev) => prev.map((s) => ({ ...s, status: 'complete' }))); break;
            }
          } catch {}
        }
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') addLog('error', `Failed: ${err.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const stopPipeline = () => { abortRef.current?.abort(); setIsProcessing(false); addLog('warning', 'Stopped'); };

  const step1SheetData = getSheetByName(step1Sheet);
  const canStart = excelPath && step1PromptCol && !isProcessing;

  return (
    <div className="min-h-screen">
      <header className="border-b border-[var(--border)] bg-[var(--bg-secondary)]/80 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[var(--accent)] to-[var(--accent-dark)] flex items-center justify-center">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"><path d="M20.38 3.46 16 2 12 5.5 8 2 3.62 3.46 2 8l3.5 4L2 16l1.62 4.54L8 22l4-3.5 4 3.5 4.38-1.46L22 16l-3.5-4L22 8z" /></svg>
            </div>
            <div>
              <h1 className="text-lg font-semibold">Clothing Pipeline v6</h1>
              <p className="text-xs text-[var(--text-muted)]">5 Steps: Generate → Dress → Extract → Final → Save</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setShowFileManager(true)} className="px-4 py-2 rounded-lg bg-[var(--bg-tertiary)] text-[var(--text-secondary)] text-sm hover:bg-[var(--bg-elevated)] transition">📂 Files</button>
          <button onClick={() => setShowSettings(!showSettings)} className="px-4 py-2 rounded-lg bg-[var(--bg-tertiary)] text-[var(--text-secondary)] text-sm">⚙️ Settings</button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8 space-y-8">
        <div className="bg-[var(--bg-secondary)] rounded-2xl border border-[var(--border)] p-6">
          <StepIndicator steps={pipelineSteps} />
        </div>

        <div className="bg-[var(--bg-secondary)] rounded-2xl border border-[var(--border)] p-6">
          <h3 className="text-base font-semibold mb-4">📁 Excel File</h3>
          <FileUploadZone label="Upload Excel" description="Auto-select columns" accept=".xlsx,.xls" icon={<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>} onFileSelect={handleExcelUpload} selectedFile={excelFile} />
          {sheets.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {sheets.map((s) => <span key={s.name} className={`px-3 py-1 rounded-full text-xs ${s.name === SHEET_PROMPT || s.name === SHEET_CATEGORY ? 'bg-green-500/20 text-green-300 border border-green-500/30' : 'bg-[var(--bg-primary)] text-[var(--text-muted)]'}`}>{s.name} ({s.rowCount})</span>)}
            </div>
          )}
        </div>

        {sheets.length > 0 && (
          <div className="bg-[var(--bg-secondary)] rounded-2xl border border-[var(--border)] overflow-hidden">
            <div className="flex border-b border-[var(--border)] overflow-x-auto">
              {(['step1', 'step2', 'step3', 'step4', 'step5'] as const).map((tab, idx) => (
                <button key={tab} onClick={() => setActiveTab(tab)} className={`flex-shrink-0 px-5 py-3 text-sm font-medium whitespace-nowrap ${activeTab === tab ? 'bg-[var(--bg-tertiary)] text-[var(--text-primary)] border-b-2 border-[var(--accent)]' : 'text-[var(--text-muted)]'}`}>
                  {['1️⃣ Generate (E)', '2️⃣ Dress (G→E)', '3️⃣ Extract (J)', '4️⃣ Final', '5️⃣ Save (D,A)'][idx]}
                </button>
              ))}
            </div>

            <div className="p-6">
              {activeTab === 'step1' && (
                <div className="space-y-6">
                  <div className="p-4 rounded-xl bg-blue-500/10 border border-blue-500/30">
                    <p className="text-sm text-blue-300"><strong>Sheet:</strong> {SHEET_PROMPT} | <strong>Prompt:</strong> Column E</p>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-[var(--text-muted)] mb-2 uppercase">Sheet</label>
                      <select value={step1Sheet} onChange={(e) => setStep1Sheet(e.target.value)} className="w-full px-3 py-2.5 rounded-lg bg-[var(--bg-primary)] border border-[var(--border)] text-sm">
                        {sheets.map((s) => <option key={s.name} value={s.name}>{s.name}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-[var(--text-muted)] mb-2 uppercase">Prompt Column <span className="text-green-400">(E)</span></label>
                      <select value={step1PromptCol} onChange={(e) => setStep1PromptCol(e.target.value)} className="w-full px-3 py-2.5 rounded-lg bg-[var(--bg-primary)] border border-green-500/30 text-sm">
                        {getSheetByName(step1Sheet)?.columns.map((col, idx) => <option key={idx} value={col}>{col}</option>)}
                      </select>
                    </div>
                  </div>
                  {step1SheetData && (
                    <div className="p-4 rounded-xl bg-[var(--bg-primary)] border border-[var(--border)]">
                      <label className="block text-xs font-medium text-[var(--text-muted)] mb-3 uppercase">Row Selection ({step1SheetData.rowCount} rows)</label>
                      <div className="flex flex-wrap gap-3 mb-4">
                        {(['all', 'count', 'range'] as const).map((m) => <button key={m} onClick={() => setRowMode(m)} className={`px-4 py-2 rounded-lg text-sm font-medium ${rowMode === m ? 'bg-[var(--accent)]/15 text-[var(--accent-light)] ring-1 ring-[var(--accent)]/30' : 'bg-[var(--bg-tertiary)] text-[var(--text-muted)]'}`}>{m === 'all' ? 'All' : m === 'count' ? 'First N' : 'Range'}</button>)}
                      </div>
                      {rowMode === 'count' && <div className="flex items-center gap-3"><span className="text-sm">Process first</span><input type="number" min={1} max={step1SheetData.rowCount} value={rowCount} onChange={(e) => setRowCount(Math.max(1, parseInt(e.target.value) || 1))} className="w-24 px-3 py-2 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border)] text-sm text-center font-mono" /><span className="text-sm">rows</span></div>}
                      {rowMode === 'range' && <div className="flex items-center gap-3"><span className="text-sm">From</span><input type="number" min={1} value={rowStart} onChange={(e) => setRowStart(Math.max(1, parseInt(e.target.value) || 1))} className="w-20 px-3 py-2 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border)] text-sm text-center font-mono" /><span className="text-sm">to</span><input type="number" min={rowStart} value={rowEnd} onChange={(e) => setRowEnd(Math.max(rowStart, parseInt(e.target.value) || rowStart))} className="w-20 px-3 py-2 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border)] text-sm text-center font-mono" /></div>}
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'step2' && (
                <div className="space-y-6">
                  <div className="p-4 rounded-xl bg-blue-500/10 border border-blue-500/30">
                    <p className="text-sm text-blue-300"><strong>Sheet:</strong> {SHEET_CATEGORY} | <strong>Prompt:</strong> G | <strong>{'{{var}}'}</strong> → E</p>
                  </div>
                  <div className="p-4 rounded-xl bg-yellow-500/10 border border-yellow-500/30">
                    <p className="text-sm text-yellow-300">💡 ทุก {'{{variable_name}}'} จะถูกแทนด้วยค่าจาก <strong>Column E</strong></p>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div><label className="block text-xs font-medium text-[var(--text-muted)] mb-2 uppercase">Sheet</label><select value={step2Sheet} onChange={(e) => setStep2Sheet(e.target.value)} className="w-full px-3 py-2.5 rounded-lg bg-[var(--bg-primary)] border border-[var(--border)] text-sm">{sheets.map((s) => <option key={s.name} value={s.name}>{s.name}</option>)}</select></div>
                    <div><label className="block text-xs font-medium text-[var(--text-muted)] mb-2 uppercase">Prompt <span className="text-green-400">(G)</span></label><select value={step2PromptCol} onChange={(e) => setStep2PromptCol(e.target.value)} className="w-full px-3 py-2.5 rounded-lg bg-[var(--bg-primary)] border border-green-500/30 text-sm">{getSheetByName(step2Sheet)?.columns.map((col, idx) => <option key={idx} value={col}>{col}</option>)}</select></div>
                    <div><label className="block text-xs font-medium text-[var(--text-muted)] mb-2 uppercase">Variable <span className="text-yellow-400">(E)</span></label><select value={step2VariableCol} onChange={(e) => setStep2VariableCol(e.target.value)} className="w-full px-3 py-2.5 rounded-lg bg-[var(--bg-primary)] border border-yellow-500/30 text-sm">{getSheetByName(step2Sheet)?.columns.map((col, idx) => <option key={idx} value={col}>{col}</option>)}</select></div>
                  </div>
                  <DraggableImageList images={step2Images} onReorder={setStep2Images} onRemove={(id) => setStep2Images((prev) => prev.filter((img) => img.id !== id))} onAdd={(files) => handleStep2ImagesUpload(files)} label="🧍 Mannequin Images (รูป Step 1 จะอยู่แรก)" />
                  <button onClick={() => setStep2Images(DEFAULT_STEP2_IMAGES)} className="text-xs text-[var(--text-muted)] hover:text-[var(--accent-light)] transition">🔄 Reset to Default Images</button>
                </div>
              )}

              {activeTab === 'step3' && (
                <div className="space-y-6">
                  <div className="p-4 rounded-xl bg-blue-500/10 border border-blue-500/30">
                    <p className="text-sm text-blue-300"><strong>Sheet:</strong> {SHEET_CATEGORY} | <strong>Prompt:</strong> J | 👕 Extract Clothing</p>
                  </div>
                  <div className="p-4 rounded-xl bg-purple-500/10 border border-purple-500/30">
                    <p className="text-sm text-purple-300">
                      👕 <strong>Output:</strong> เสื้อผ้าบน Transparent Background<br/>
                      • ใช้คำอธิบายจาก <strong>Column E</strong> เป็นตัวบอก AI ว่าเสื้อผ้าคืออะไร<br/>
                      • AI จะถอดเสื้อผ้าออกจากหุ่นโดยตรง
                    </p>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div><label className="block text-xs font-medium text-[var(--text-muted)] mb-2 uppercase">Sheet</label><select value={step3Sheet} onChange={(e) => setStep3Sheet(e.target.value)} className="w-full px-3 py-2.5 rounded-lg bg-[var(--bg-primary)] border border-[var(--border)] text-sm">{sheets.map((s) => <option key={s.name} value={s.name}>{s.name}</option>)}</select></div>
                    <div><label className="block text-xs font-medium text-[var(--text-muted)] mb-2 uppercase">Prompt <span className="text-green-400">(J)</span></label><select value={step3PromptCol} onChange={(e) => setStep3PromptCol(e.target.value)} className="w-full px-3 py-2.5 rounded-lg bg-[var(--bg-primary)] border border-green-500/30 text-sm">{getSheetByName(step3Sheet)?.columns.map((col, idx) => <option key={idx} value={col}>{col}</option>)}</select></div>
                  </div>
                  <DraggableImageList images={step3Images} onReorder={setStep3Images} onRemove={(id) => setStep3Images((prev) => prev.filter((img) => img.id !== id))} onAdd={(files) => handleStep3ImagesUpload(files)} label="📸 Reference Images (ช่วย AI เข้าใจรูปแบบเสื้อผ้า)" />
                  <button onClick={() => setStep3Images(DEFAULT_STEP3_IMAGES)} className="text-xs text-[var(--text-muted)] hover:text-[var(--accent-light)] transition">🔄 Reset to Default Images</button>
                </div>
              )}

              {activeTab === 'step4' && (
                <div className="space-y-6">
                  <div className="p-4 rounded-xl bg-blue-500/10 border border-blue-500/30">
                    <p className="text-sm text-blue-300"><strong>Step 4:</strong> Final Result | ใช้ผลจาก Step 3 โดยตรง</p>
                  </div>
                  <div className="p-4 rounded-xl bg-green-500/10 border border-green-500/30">
                    <p className="text-sm text-green-300">
                      ✅ <strong>Output:</strong> เสื้อผ้าบน Transparent Background<br/>
                      • พร้อมสำหรับบันทึกใน Step 5
                    </p>
                  </div>
                </div>
              )}

              {activeTab === 'step5' && (
                <div className="space-y-6">
                  <div className="p-4 rounded-xl bg-blue-500/10 border border-blue-500/30">
                    <p className="text-sm text-blue-300"><strong>Sheet:</strong> {SHEET_PROMPT} | <strong>Folder:</strong> D | <strong>Filename:</strong> A</p>
                  </div>
                  <div><label className="block text-xs font-medium text-[var(--text-muted)] mb-2 uppercase">Base Path</label><input type="text" value={step5BasePath} onChange={(e) => setStep5BasePath(e.target.value)} className="w-full px-3 py-2.5 rounded-lg bg-[var(--bg-primary)] border border-[var(--border)] text-sm font-mono" /></div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div><label className="block text-xs font-medium text-[var(--text-muted)] mb-2 uppercase">Sheet</label><select value={step5Sheet} onChange={(e) => setStep5Sheet(e.target.value)} className="w-full px-3 py-2.5 rounded-lg bg-[var(--bg-primary)] border border-[var(--border)] text-sm">{sheets.map((s) => <option key={s.name} value={s.name}>{s.name}</option>)}</select></div>
                    <div><label className="block text-xs font-medium text-[var(--text-muted)] mb-2 uppercase">Folder <span className="text-green-400">(D)</span></label><select value={step5FolderCol} onChange={(e) => setStep5FolderCol(e.target.value)} className="w-full px-3 py-2.5 rounded-lg bg-[var(--bg-primary)] border border-green-500/30 text-sm">{getSheetByName(step5Sheet)?.columns.map((col, idx) => <option key={idx} value={col}>{col}</option>)}</select></div>
                    <div><label className="block text-xs font-medium text-[var(--text-muted)] mb-2 uppercase">Filename <span className="text-green-400">(A)</span></label><select value={step5FileCol} onChange={(e) => setStep5FileCol(e.target.value)} className="w-full px-3 py-2.5 rounded-lg bg-[var(--bg-primary)] border border-green-500/30 text-sm">{getSheetByName(step5Sheet)?.columns.map((col, idx) => <option key={idx} value={col}>{col}</option>)}</select></div>
                  </div>
                  <div className="p-4 rounded-xl bg-green-500/10 border border-green-500/30">
                    <p className="text-sm text-green-300">💾 <strong>Path:</strong> <code>{step5BasePath}/[D]/[A].png</code></p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {showSettings && (
          <div className="bg-[var(--bg-secondary)] rounded-2xl border border-[var(--border)] p-6 space-y-5">
            <h3 className="text-base font-semibold">⚙️ Models</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div><label className="block text-xs font-medium text-[var(--text-muted)] mb-2 uppercase">Image Gen</label><input type="text" value={imageGenModel} onChange={(e) => setImageGenModel(e.target.value)} className="w-full px-3 py-2.5 rounded-lg bg-[var(--bg-primary)] border border-[var(--border)] text-sm font-mono" /></div>
              <div><label className="block text-xs font-medium text-[var(--text-muted)] mb-2 uppercase">Vision</label><input type="text" value={visionModel} onChange={(e) => setVisionModel(e.target.value)} className="w-full px-3 py-2.5 rounded-lg bg-[var(--bg-primary)] border border-[var(--border)] text-sm font-mono" /></div>
            </div>
          </div>
        )}

        <div className="flex items-center gap-4">
          {!isProcessing ? (
            <button onClick={startPipeline} disabled={!canStart} className={`px-8 py-3.5 rounded-xl font-semibold text-sm flex items-center gap-3 ${canStart ? 'bg-[var(--accent)] hover:bg-[var(--accent-dark)] text-white' : 'bg-[var(--bg-tertiary)] text-[var(--text-muted)] cursor-not-allowed'}`}>▶️ Start Pipeline</button>
          ) : (
            <button onClick={stopPipeline} className="px-8 py-3.5 rounded-xl font-semibold text-sm bg-red-600 hover:bg-red-700 text-white flex items-center gap-3">⏹️ Stop</button>
          )}
          {(isProcessing || progress > 0) && <div className="flex-1 flex items-center gap-4"><div className="flex-1 h-2 rounded-full bg-[var(--bg-tertiary)] overflow-hidden"><div className="progress-bar h-full rounded-full" style={{ width: `${progress}%` }} /></div><span className="text-sm font-mono">{Math.round(progress)}%</span></div>}
        </div>

        {logs.length > 0 && <div><div className="flex items-center justify-between mb-3"><h3 className="text-sm font-semibold text-[var(--text-muted)] uppercase">Log</h3><button onClick={() => setLogs([])} className="text-xs text-[var(--text-muted)]">Clear</button></div><LogPanel logs={logs} maxHeight="250px" /></div>}

        {results.length > 0 && <div><h3 className="text-sm font-semibold text-[var(--text-muted)] uppercase mb-4">Results ({results.length})</h3><div className="bg-[var(--bg-secondary)] rounded-2xl border border-[var(--border)] p-6"><ResultGallery results={results} /></div></div>}
      </main>

      <footer className="border-t border-[var(--border)] mt-16 py-6 text-center"><p className="text-xs text-[var(--text-muted)]">Clothing Pipeline v6.0 — 5-Step Workflow</p></footer>

      {showFileManager && <FileManager onClose={() => setShowFileManager(false)} />}
    </div>
  );
}
