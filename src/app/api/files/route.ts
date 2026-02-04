import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

interface FileItem {
  name: string;
  path: string;
  type: 'file' | 'folder';
  size?: number;
  modified?: string;
  extension?: string;
  children?: FileItem[];
}

function getFileTree(dirPath: string, basePath: string = ''): FileItem[] {
  const items: FileItem[] = [];
  
  try {
    if (!fs.existsSync(dirPath)) {
      return items;
    }

    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      const relativePath = path.join(basePath, entry.name);
      
      if (entry.isDirectory()) {
        const children = getFileTree(fullPath, relativePath);
        items.push({
          name: entry.name,
          path: relativePath,
          type: 'folder',
          children,
        });
      } else if (entry.isFile()) {
        const stats = fs.statSync(fullPath);
        const ext = path.extname(entry.name).toLowerCase();
        
        items.push({
          name: entry.name,
          path: relativePath,
          type: 'file',
          size: stats.size,
          modified: stats.mtime.toISOString(),
          extension: ext,
        });
      }
    }
    
    // Sort: folders first, then files alphabetically
    items.sort((a, b) => {
      if (a.type === 'folder' && b.type === 'file') return -1;
      if (a.type === 'file' && b.type === 'folder') return 1;
      return a.name.localeCompare(b.name);
    });
    
  } catch (error) {
    console.error('Error reading directory:', error);
  }
  
  return items;
}

function countFiles(items: FileItem[]): { folders: number; files: number; totalSize: number } {
  let folders = 0;
  let files = 0;
  let totalSize = 0;
  
  for (const item of items) {
    if (item.type === 'folder') {
      folders++;
      if (item.children) {
        const childCounts = countFiles(item.children);
        folders += childCounts.folders;
        files += childCounts.files;
        totalSize += childCounts.totalSize;
      }
    } else {
      files++;
      totalSize += item.size || 0;
    }
  }
  
  return { folders, files, totalSize };
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const basePath = searchParams.get('path') || './public/output';
  
  try {
    const absolutePath = path.resolve(basePath);
    
    // Security check: ensure path is within allowed directory
    const allowedBase = path.resolve('./public/output');
    if (!absolutePath.startsWith(allowedBase)) {
      return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 });
    }
    
    const tree = getFileTree(absolutePath);
    const counts = countFiles(tree);
    
    return NextResponse.json({
      success: true,
      basePath,
      tree,
      stats: {
        folders: counts.folders,
        files: counts.files,
        totalSize: counts.totalSize,
      },
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const body = await request.json();
  const { filePath } = body;
  
  if (!filePath) {
    return NextResponse.json({ success: false, error: 'No path provided' }, { status: 400 });
  }
  
  try {
    const absolutePath = path.resolve('./public/output', filePath);
    
    // Security check
    const allowedBase = path.resolve('./public/output');
    if (!absolutePath.startsWith(allowedBase)) {
      return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 });
    }
    
    if (!fs.existsSync(absolutePath)) {
      return NextResponse.json({ success: false, error: 'File not found' }, { status: 404 });
    }
    
    const stats = fs.statSync(absolutePath);
    
    if (stats.isDirectory()) {
      fs.rmSync(absolutePath, { recursive: true });
    } else {
      fs.unlinkSync(absolutePath);
    }
    
    return NextResponse.json({ success: true, message: 'Deleted successfully' });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
