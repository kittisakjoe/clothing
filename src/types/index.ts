export interface ExcelConfig {
  filePath: string;
  sheetName: string;
  promptColumn: string;
  nameColumn?: string;
}

export interface PipelineItem {
  id: string;
  rowIndex: number;
  name: string;
  prompt: string;
  status: 'pending' | 'step1' | 'step2' | 'step3' | 'completed' | 'error';
  step1Image?: string;
  step2Image?: string;
  step3Images?: string[];
  error?: string;
}

export interface PipelineConfig {
  excel: ExcelConfig;
  referenceImagePath: string;
  boneImagePath: string;
  step1Model: string;
  step2Model: string;
  step3Model: string;
  step2Prompt: string;
  step3Prompt: string;
  outputDir: string;
}

export interface ProcessRequest {
  config: PipelineConfig;
  items: PipelineItem[];
}

export interface SheetInfo {
  name: string;
  columns: string[];
  rowCount: number;
  preview: Record<string, string>[];
}

export interface UploadResponse {
  success: boolean;
  filePath?: string;
  sheets?: SheetInfo[];
  error?: string;
}

export interface StepResult {
  success: boolean;
  imageUrl?: string;
  imageUrls?: string[];
  error?: string;
}

export interface SSEMessage {
  type: 'progress' | 'step_complete' | 'item_complete' | 'error' | 'done';
  itemId?: string;
  step?: number;
  imageUrl?: string;
  imageUrls?: string[];
  message?: string;
  progress?: number;
}
