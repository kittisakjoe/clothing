import * as XLSX from 'xlsx';
import fs from 'fs';
import path from 'path';
import { SheetInfo } from '@/types';

// Convert column index to letter (0=A, 1=B, 25=Z, 26=AA...)
function indexToLetter(index: number): string {
  let letter = '';
  let temp = index;
  while (temp >= 0) {
    letter = String.fromCharCode((temp % 26) + 65) + letter;
    temp = Math.floor(temp / 26) - 1;
  }
  return letter;
}

// Convert letter to index (A=0, B=1, Z=25, AA=26...)
function letterToIndex(letter: string): number {
  let index = 0;
  for (let i = 0; i < letter.length; i++) {
    index = index * 26 + (letter.charCodeAt(i) - 64);
  }
  return index - 1;
}

export function readExcelFile(filePath: string): XLSX.WorkBook {
  const absolutePath = path.resolve(filePath);
  if (!fs.existsSync(absolutePath)) {
    throw new Error(`File not found: ${absolutePath}`);
  }
  const buffer = fs.readFileSync(absolutePath);
  return XLSX.read(buffer, { type: 'buffer' });
}

export function getSheetNames(workbook: XLSX.WorkBook): string[] {
  return workbook.SheetNames;
}

export function getSheetInfo(filePath: string): SheetInfo[] {
  const workbook = readExcelFile(filePath);
  const sheets: SheetInfo[] = [];

  for (const sheetName of workbook.SheetNames) {
    const worksheet = workbook.Sheets[sheetName];
    const jsonData = XLSX.utils.sheet_to_json<any[]>(worksheet, {
      header: 1,
      defval: '',
    });

    if (jsonData.length === 0) continue;

    const headerRow = jsonData[0] as string[];
    const dataRows = jsonData.slice(1);

    // Create columns with letter prefix (A: Name, B: Category, etc.)
    // Keep ALL columns including duplicates and empty
    const columns: string[] = headerRow.map((header, idx) => {
      const letter = indexToLetter(idx);
      const name = String(header || '').trim();
      return `${letter}: ${name || '(empty)'}`;
    });

    // Create preview (first 5 rows)
    const preview = dataRows.slice(0, 5).map((row: any) => {
      const obj: Record<string, string> = {};
      columns.forEach((col, idx) => {
        obj[col] = String(row[idx] ?? '');
      });
      return obj;
    });

    sheets.push({
      name: sheetName,
      columns,
      rowCount: dataRows.length,
      preview,
    });
  }

  return sheets;
}

export function readColumnData(
  filePath: string,
  sheetName: string,
  promptColumn: string,
  nameColumn?: string
): { name: string; prompt: string; rowIndex: number }[] {
  const workbook = readExcelFile(filePath);
  const worksheet = workbook.Sheets[sheetName];

  if (!worksheet) {
    throw new Error(`Sheet "${sheetName}" not found`);
  }

  const jsonData = XLSX.utils.sheet_to_json<any[]>(worksheet, {
    header: 1,
    defval: '',
  });

  if (jsonData.length === 0) {
    throw new Error('Sheet is empty');
  }

  // Extract column letter from "A: Name" format or use as letter directly
  const getColumnIndex = (col: string): number => {
    const match = col.match(/^([A-Z]+):/);
    if (match) {
      return letterToIndex(match[1]);
    }
    // If it's just a letter
    if (/^[A-Z]+$/.test(col)) {
      return letterToIndex(col);
    }
    // Try to find by header name (legacy support)
    const headerRow = jsonData[0] as string[];
    const idx = headerRow.findIndex(h => String(h).trim() === col);
    return idx;
  };

  const promptColIdx = getColumnIndex(promptColumn);
  const nameColIdx = nameColumn ? getColumnIndex(nameColumn) : -1;

  if (promptColIdx === -1) {
    throw new Error(`Column "${promptColumn}" not found in sheet "${sheetName}"`);
  }

  const results: { name: string; prompt: string; rowIndex: number }[] = [];
  const dataRows = jsonData.slice(1);

  dataRows.forEach((row: any, idx: number) => {
    const prompt = String(row[promptColIdx] ?? '').trim();
    if (!prompt) return;

    const name = nameColIdx >= 0
      ? String(row[nameColIdx] ?? '').trim() || `Item_${idx + 1}`
      : `Item_${idx + 1}`;

    results.push({
      name,
      prompt,
      rowIndex: idx + 2, // +2 for header row and 0-based index
    });
  });

  return results;
}

/**
 * Read multiple columns from Excel for template variable replacement
 * Returns array of objects where each object is a row with column name as key
 */
export function readMultipleColumns(
  filePath: string,
  sheetName: string,
  columnNames: string[]
): Record<string, string>[] {
  const workbook = readExcelFile(filePath);
  const worksheet = workbook.Sheets[sheetName];

  if (!worksheet) {
    throw new Error(`Sheet "${sheetName}" not found`);
  }

  const jsonData = XLSX.utils.sheet_to_json<any[]>(worksheet, {
    header: 1,
    defval: '',
  });

  if (jsonData.length === 0) {
    throw new Error('Sheet is empty');
  }

  // Extract column letter from "A: Name" format
  const getColumnIndex = (col: string): number => {
    const match = col.match(/^([A-Z]+):/);
    if (match) {
      return letterToIndex(match[1]);
    }
    if (/^[A-Z]+$/.test(col)) {
      return letterToIndex(col);
    }
    const headerRow = jsonData[0] as string[];
    return headerRow.findIndex(h => String(h).trim() === col);
  };

  // Find column indices
  const columnIndices: { name: string; idx: number }[] = [];
  for (const colName of columnNames) {
    const idx = getColumnIndex(colName);
    if (idx >= 0) {
      columnIndices.push({ name: colName, idx });
    }
  }

  const results: Record<string, string>[] = [];
  const dataRows = jsonData.slice(1);

  dataRows.forEach((row: any) => {
    const rowData: Record<string, string> = {};
    for (const { name, idx } of columnIndices) {
      rowData[name] = String(row[idx] ?? '').trim();
    }
    results.push(rowData);
  });

  return results;
}
