import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { getSheetInfo } from '@/lib/excel-reader';

// Use /tmp on Vercel (serverless), ./public locally
const isVercel = process.env.VERCEL === '1';
const UPLOADS_DIR = isVercel ? '/tmp/uploads' : path.resolve('./public/uploads');

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const type = formData.get('type') as string | null;

    if (!file) {
      return NextResponse.json({ success: false, error: 'No file provided' }, { status: 400 });
    }

    // Create uploads directory
    if (!fs.existsSync(UPLOADS_DIR)) {
      fs.mkdirSync(UPLOADS_DIR, { recursive: true });
    }

    // Save file
    const buffer = Buffer.from(await file.arrayBuffer());
    const fileName = `${type || 'file'}_${Date.now()}_${file.name}`;
    const filePath = path.join(UPLOADS_DIR, fileName);
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
