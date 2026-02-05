import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { getSheetInfo } from '@/lib/excel-reader';

function getUploadsDir(): string {
  // Always try /tmp first on serverless
  try {
    const tmpDir = '/tmp/uploads';
    if (!fs.existsSync(tmpDir)) {
      fs.mkdirSync(tmpDir, { recursive: true });
    }
    // Test if writable
    const testFile = path.join(tmpDir, '.write-test');
    fs.writeFileSync(testFile, 'test');
    fs.unlinkSync(testFile);
    console.log('[Upload] Using /tmp/uploads');
    return tmpDir;
  } catch {
    // Fallback to local
    const localDir = path.resolve('./public/uploads');
    if (!fs.existsSync(localDir)) {
      fs.mkdirSync(localDir, { recursive: true });
    }
    console.log('[Upload] Using ./public/uploads');
    return localDir;
  }
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const type = formData.get('type') as string | null;

    if (!file) {
      return NextResponse.json({ success: false, error: 'No file provided' }, { status: 400 });
    }

    const uploadsDir = getUploadsDir();

    // Save file
    const buffer = Buffer.from(await file.arrayBuffer());
    const fileName = `${type || 'file'}_${Date.now()}_${file.name}`;
    const filePath = path.join(uploadsDir, fileName);
    fs.writeFileSync(filePath, buffer);

    console.log(`[Upload] Saved to: ${filePath}`);

    // If it's an Excel file, get sheet info
    if (type === 'excel' && (file.name.endsWith('.xlsx') || file.name.endsWith('.xls'))) {
      const sheets = getSheetInfo(filePath);
      return NextResponse.json({
        success: true,
        filePath,
        sheets,
      });
    }

    return NextResponse.json({
      success: true,
      filePath,
    });
  } catch (error: any) {
    console.error('Upload error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Upload failed' },
      { status: 500 }
    );
  }
}

export const dynamic = 'force-dynamic';
