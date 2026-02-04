import { NextRequest, NextResponse } from 'next/server';
import { readColumnData } from '@/lib/excel-reader';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { filePath, sheetName, promptColumn, nameColumn } = body;

    if (!filePath || !sheetName || !promptColumn) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: filePath, sheetName, promptColumn' },
        { status: 400 }
      );
    }

    const data = readColumnData(filePath, sheetName, promptColumn, nameColumn);

    return NextResponse.json({
      success: true,
      data,
      count: data.length,
    });
  } catch (error: any) {
    console.error('Sheet read error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to read sheet data' },
      { status: 500 }
    );
  }
}
