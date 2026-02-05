import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

/**
 * Save a base64 image to disk - always uses /tmp
 */
export function saveBase64Image(
  base64Data: string,
  outputDir: string,
  fileName: string
): string {
  // Always redirect to /tmp
  let absoluteDir: string;
  if (outputDir.startsWith('/tmp')) {
    absoluteDir = outputDir;
  } else {
    absoluteDir = path.join('/tmp', outputDir.replace(/^\.?\/?public\/?/, ''));
  }
  
  if (!fs.existsSync(absoluteDir)) {
    fs.mkdirSync(absoluteDir, { recursive: true });
  }

  const base64 = base64Data.replace(/^data:image\/\w+;base64,/, '');
  const buffer = Buffer.from(base64, 'base64');

  let ext = '.png';
  if (base64Data.startsWith('data:image/jpeg')) ext = '.jpg';
  else if (base64Data.startsWith('data:image/webp')) ext = '.webp';

  const fullFileName = fileName.includes('.') ? fileName : `${fileName}${ext}`;
  const filePath = path.join(absoluteDir, fullFileName);

  fs.writeFileSync(filePath, buffer);
  console.log(`[saveBase64Image] Saved to: ${filePath}`);

  return filePath;
}

/**
 * Remove white/light background and make it transparent
 * Uses sharp to process the image
 */
export async function removeWhiteBackground(
  base64Data: string,
  threshold: number = 240 // Colors above this value (0-255) are considered "white"
): Promise<string> {
  console.log('[removeWhiteBackground] Starting background removal...');
  
  // Remove data URI prefix
  const base64 = base64Data.replace(/^data:image\/\w+;base64,/, '');
  const inputBuffer = Buffer.from(base64, 'base64');

  try {
    // Get image info
    const metadata = await sharp(inputBuffer).metadata();
    const width = metadata.width || 512;
    const height = metadata.height || 512;

    // Get raw pixel data
    const { data, info } = await sharp(inputBuffer)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    // Process pixels - make near-white pixels transparent
    const pixels = new Uint8Array(data);
    for (let i = 0; i < pixels.length; i += 4) {
      const r = pixels[i];
      const g = pixels[i + 1];
      const b = pixels[i + 2];
      
      // Check if pixel is near-white (high values in all channels)
      if (r > threshold && g > threshold && b > threshold) {
        pixels[i + 3] = 0; // Set alpha to 0 (transparent)
      }
    }

    // Create new image with transparent background
    const outputBuffer = await sharp(Buffer.from(pixels), {
      raw: {
        width: info.width,
        height: info.height,
        channels: 4,
      },
    })
      .png()
      .toBuffer();

    console.log('[removeWhiteBackground] Background removed successfully');
    return `data:image/png;base64,${outputBuffer.toString('base64')}`;
  } catch (error: any) {
    console.error('[removeWhiteBackground] Error:', error.message);
    // Return original if processing fails
    return base64Data;
  }
}

/**
 * Remove GREEN chroma key background and make it transparent
 * Specifically designed for green screen (#00FF00) backgrounds
 */
export async function removeGreenBackground(
  base64Data: string,
  tolerance: number = 80 // How much deviation from pure green is allowed
): Promise<string> {
  console.log('[removeGreenBackground] Starting green screen removal...');
  
  // Remove data URI prefix
  const base64 = base64Data.replace(/^data:image\/\w+;base64,/, '');
  const inputBuffer = Buffer.from(base64, 'base64');

  try {
    // Get raw pixel data
    const { data, info } = await sharp(inputBuffer)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    // Process pixels - make green pixels transparent
    const pixels = new Uint8Array(data);
    let removedCount = 0;
    
    for (let i = 0; i < pixels.length; i += 4) {
      const r = pixels[i];
      const g = pixels[i + 1];
      const b = pixels[i + 2];
      
      // Check if pixel is green (high G, low R and B)
      // Pure green is R=0, G=255, B=0
      const isGreen = (
        g > 150 && // Green channel is high
        g > r + 50 && // Green is significantly higher than red
        g > b + 50 && // Green is significantly higher than blue
        r < 150 && // Red is relatively low
        b < 150    // Blue is relatively low
      );
      
      // Also check for bright/lime green variations
      const isLimeGreen = (
        g > 200 &&
        r < 200 &&
        b < 200 &&
        g - r > 30 &&
        g - b > 30
      );
      
      if (isGreen || isLimeGreen) {
        pixels[i + 3] = 0; // Set alpha to 0 (transparent)
        removedCount++;
      }
    }

    console.log(`[removeGreenBackground] Removed ${removedCount} green pixels`);

    // Create new image with transparent background
    const outputBuffer = await sharp(Buffer.from(pixels), {
      raw: {
        width: info.width,
        height: info.height,
        channels: 4,
      },
    })
      .png()
      .toBuffer();

    console.log('[removeGreenBackground] Green background removed successfully');
    return `data:image/png;base64,${outputBuffer.toString('base64')}`;
  } catch (error: any) {
    console.error('[removeGreenBackground] Error:', error.message);
    // Return original if processing fails
    return base64Data;
  }
}

/**
 * Apply a mask to an image
 * The mask should have:
 * - White pixels = clothing (keep from original)
 * - Black pixels = mannequin (make transparent)
 * - Transparent pixels = background (make transparent)
 * 
 * Only WHITE pixels from the mask will be kept from the original image
 */
export async function applyMaskToImage(
  originalBase64: string,
  maskBase64: string
): Promise<string> {
  console.log('[applyMaskToImage] Applying mask to extract clothing...');
  
  // Remove data URI prefix
  const originalData = originalBase64.replace(/^data:image\/\w+;base64,/, '');
  const maskData = maskBase64.replace(/^data:image\/\w+;base64,/, '');
  
  const originalBuffer = Buffer.from(originalData, 'base64');
  const maskBuffer = Buffer.from(maskData, 'base64');

  try {
    // Get original image info
    const originalMeta = await sharp(originalBuffer).metadata();
    const width = originalMeta.width || 512;
    const height = originalMeta.height || 512;

    // Resize mask to match original image size - keep RGBA
    const { data: resizedMaskData } = await sharp(maskBuffer)
      .resize(width, height, { fit: 'fill' })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    // Get original image raw data with alpha
    const { data: originalPixels, info } = await sharp(originalBuffer)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    // Apply mask
    const outputPixels = new Uint8Array(originalPixels);
    const maskPixels = new Uint8Array(resizedMaskData);
    
    let keptPixels = 0;
    let removedPixels = 0;

    for (let i = 0; i < info.width * info.height; i++) {
      const pixelIndex = i * 4;
      
      // Get mask pixel RGBA
      const maskR = maskPixels[pixelIndex];
      const maskG = maskPixels[pixelIndex + 1];
      const maskB = maskPixels[pixelIndex + 2];
      const maskA = maskPixels[pixelIndex + 3];
      
      // Check if mask pixel is WHITE (clothing) - only keep these
      // Must be: high R, high G, high B, and not transparent
      const isWhite = maskR > 200 && maskG > 200 && maskB > 200 && maskA > 128;
      
      if (isWhite) {
        // Keep original pixel
        keptPixels++;
      } else {
        // Everything else (black mannequin, transparent background, colors) = transparent
        outputPixels[pixelIndex + 3] = 0; // Set alpha to 0
        removedPixels++;
      }
    }

    console.log(`[applyMaskToImage] Kept ${keptPixels} pixels (clothing), removed ${removedPixels} pixels (background/mannequin)`);

    // Create output image
    const outputBuffer = await sharp(Buffer.from(outputPixels), {
      raw: {
        width: info.width,
        height: info.height,
        channels: 4,
      },
    })
      .png()
      .toBuffer();

    console.log('[applyMaskToImage] Mask applied successfully');
    return `data:image/png;base64,${outputBuffer.toString('base64')}`;
  } catch (error: any) {
    console.error('[applyMaskToImage] Error:', error.message);
    // Return original if processing fails
    return originalBase64;
  }
}

/**
 * Save multiple images from step 3
 */
export function saveClothingPieces(
  images: string[],
  outputDir: string,
  baseName: string
): string[] {
  const savedPaths: string[] = [];

  images.forEach((imageBase64, idx) => {
    const fileName = `${baseName}_piece_${idx + 1}`;
    const savedPath = saveBase64Image(imageBase64, outputDir, fileName);
    savedPaths.push(savedPath);
  });

  return savedPaths;
}

/**
 * Read image file and return base64 data URI
 */
export function readImageAsBase64(filePath: string): string {
  console.log(`[readImageAsBase64] Input path: ${filePath}`);
  
  // If already a data URL, return as-is
  if (filePath.startsWith('data:')) {
    return filePath;
  }

  // Try multiple path resolutions
  const pathsToTry = [
    filePath,
    // /tmp paths (Vercel)
    filePath.startsWith('/tmp') ? filePath : `/tmp/uploads/${path.basename(filePath)}`,
    // Local paths
    path.resolve(filePath),
    path.resolve(process.cwd(), filePath),
    path.resolve(process.cwd(), filePath.replace(/^\.\//, '')),
    // public/ directory paths
    path.resolve(process.cwd(), 'public', filePath.replace(/^\.?\/?public\//, '')),
  ];

  let absolutePath = '';
  for (const p of pathsToTry) {
    console.log(`[readImageAsBase64] Trying: ${p}`);
    if (fs.existsSync(p)) {
      absolutePath = p;
      console.log(`[readImageAsBase64] Found at: ${p}`);
      break;
    }
  }

  if (!absolutePath) {
    console.error(`[readImageAsBase64] File not found. Tried paths:`, pathsToTry);
    throw new Error(`Image file not found: ${filePath}`);
  }

  const buffer = fs.readFileSync(absolutePath);
  const ext = path.extname(absolutePath).toLowerCase();

  const mimeMap: Record<string, string> = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
  };

  const mime = mimeMap[ext] || 'image/png';
  const result = `data:${mime};base64,${buffer.toString('base64')}`;
  console.log(`[readImageAsBase64] Success: ${result.length} bytes`);
  return result;
}

/**
 * Process mask image:
 * - White pixels = clothing (keep as white)
 * - Black pixels = mannequin (keep as black)
 * - Green pixels = background (convert to transparent)
 * - Other colors = convert to transparent
 */
export async function convertGreenToTransparent(
  base64Data: string
): Promise<string> {
  console.log('[convertGreenToTransparent] Processing mask...');
  
  const base64 = base64Data.replace(/^data:image\/\w+;base64,/, '');
  const inputBuffer = Buffer.from(base64, 'base64');

  try {
    const { data, info } = await sharp(inputBuffer)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const pixels = new Uint8Array(data);
    let transparentCount = 0;
    let whiteCount = 0;
    let blackCount = 0;

    for (let i = 0; i < pixels.length; i += 4) {
      const r = pixels[i];
      const g = pixels[i + 1];
      const b = pixels[i + 2];

      // Check if pixel is near-white (clothing) - keep it
      const isWhite = r > 200 && g > 200 && b > 200;
      
      // Check if pixel is near-black (mannequin) - keep it
      const isBlack = r < 60 && g < 60 && b < 60;
      
      // Check if pixel is green (background)
      const isGreen = g > 150 && g > r + 30 && g > b + 30;

      if (isWhite) {
        // Keep white pixels as-is (clothing)
        whiteCount++;
      } else if (isBlack) {
        // Keep black pixels as-is (mannequin)
        blackCount++;
      } else {
        // Green or other colors = transparent (background)
        pixels[i + 3] = 0;
        transparentCount++;
      }
    }

    console.log(`[convertGreenToTransparent] White(clothing): ${whiteCount}, Black(mannequin): ${blackCount}, Transparent(bg): ${transparentCount}`);

    const outputBuffer = await sharp(Buffer.from(pixels), {
      raw: {
        width: info.width,
        height: info.height,
        channels: 4,
      },
    })
      .png()
      .toBuffer();

    return `data:image/png;base64,${outputBuffer.toString('base64')}`;
  } catch (error: any) {
    console.error('[convertGreenToTransparent] Error:', error.message);
    return base64Data;
  }
}

/**
 * Get the public URL or data URL for an image
 * On Vercel: returns base64 data URL (since /tmp is not web-accessible)
 * Locally: returns relative URL path
 */
export function getPublicUrl(filePathOrBase64: string): string {
  // If it's already a data URL, return as-is
  if (filePathOrBase64.startsWith('data:')) {
    return filePathOrBase64;
  }
  
  // If file is in /tmp (serverless), read and return data URL
  if (filePathOrBase64.startsWith('/tmp')) {
    try {
      const buffer = fs.readFileSync(filePathOrBase64);
      const ext = path.extname(filePathOrBase64).toLowerCase();
      const mimeType = ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : 
                       ext === '.webp' ? 'image/webp' : 'image/png';
      return `data:${mimeType};base64,${buffer.toString('base64')}`;
    } catch (e) {
      console.error('[getPublicUrl] Error reading file:', e);
      return filePathOrBase64;
    }
  }
  
  // Local: return relative URL
  const publicDir = path.resolve('./public');
  const relativePath = path.relative(publicDir, filePathOrBase64);
  return `/${relativePath.replace(/\\/g, '/')}`;
}

/**
 * Save image - always uses /tmp
 */
export function saveBase64ImageSmart(
  base64Data: string,
  subDir: string,
  fileName: string
): string {
  const outputDir = path.join('/tmp', subDir);
  
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const base64 = base64Data.replace(/^data:image\/\w+;base64,/, '');
  const buffer = Buffer.from(base64, 'base64');

  let ext = '.png';
  if (base64Data.startsWith('data:image/jpeg')) ext = '.jpg';
  else if (base64Data.startsWith('data:image/webp')) ext = '.webp';

  const fullFileName = fileName.includes('.') ? fileName : `${fileName}${ext}`;
  const filePath = path.join(outputDir, fullFileName);

  fs.writeFileSync(filePath, buffer);
  console.log(`[saveBase64ImageSmart] Saved to: ${filePath}`);

  return filePath;
}

/**
 * Ensure directory exists - always uses /tmp for non-absolute paths
 */
export function ensureDir(dirPath: string): void {
  let absolutePath: string;
  if (dirPath.startsWith('/tmp')) {
    absolutePath = dirPath;
  } else {
    absolutePath = path.join('/tmp', dirPath.replace(/^\.?\/?public\/?/, ''));
  }
  if (!fs.existsSync(absolutePath)) {
    fs.mkdirSync(absolutePath, { recursive: true });
  }
}

/**
 * Clean filename for safe file system use
 */
export function sanitizeFileName(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9_\-\.]/g, '_')
    .replace(/_+/g, '_')
    .substring(0, 100);
}
