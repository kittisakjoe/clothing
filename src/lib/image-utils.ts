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
 * CODE-BASED clothing mask creation.
 * Works by detecting and removing:
 * 1. White/light background (flood-fill from edges)
 * 2. Mannequin skin (beige/tan low-saturation pixels)
 * 
 * Everything remaining = clothing = WHITE in mask
 * 
 * @param imageBase64 - The dressed mannequin image (Step 2 output)
 * @returns base64 PNG of binary mask (white=clothing, black=rest)
 */
export async function createCodeBasedClothingMask(
  imageBase64: string
): Promise<string> {
  console.log('[codeBasedMask] Starting code-based clothing mask creation...');
  
  const base64 = imageBase64.replace(/^data:image\/\w+;base64,/, '');
  const inputBuffer = Buffer.from(base64, 'base64');

  try {
    const { data, info } = await sharp(inputBuffer)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const width = info.width;
    const height = info.height;
    const pixels = new Uint8Array(data);
    
    // Output mask: 0 = remove (black), 255 = keep (white/clothing)
    const mask = new Uint8Array(width * height).fill(255); // Start with all white
    
    const idx = (x: number, y: number) => (y * width + x) * 4;
    const pixIdx = (x: number, y: number) => y * width + x;

    // ========== PHASE 1: Remove background via flood fill from edges ==========
    console.log('[codeBasedMask] Phase 1: Background detection (flood fill)...');
    
    const bgThreshold = 35;
    const visited = new Uint8Array(width * height);
    
    const isLightBg = (x: number, y: number): boolean => {
      const i = idx(x, y);
      const r = pixels[i], g = pixels[i + 1], b = pixels[i + 2];
      const min = Math.min(r, g, b);
      const max = Math.max(r, g, b);
      return min > 150 && (max - min) < 55;
    };

    // Sample bg color from corners
    const corners = [
      [0, 0], [width - 1, 0], [0, height - 1], [width - 1, height - 1],
      [Math.floor(width / 2), 0], [Math.floor(width / 2), height - 1],
      [0, Math.floor(height / 2)], [width - 1, Math.floor(height / 2)],
    ];
    
    let bgR = 0, bgG = 0, bgB = 0, bgCount = 0;
    for (const [cx, cy] of corners) {
      if (isLightBg(cx, cy)) {
        const i = idx(cx, cy);
        bgR += pixels[i]; bgG += pixels[i + 1]; bgB += pixels[i + 2];
        bgCount++;
      }
    }
    
    if (bgCount > 0) {
      bgR = Math.round(bgR / bgCount);
      bgG = Math.round(bgG / bgCount);
      bgB = Math.round(bgB / bgCount);
      console.log(`[codeBasedMask] Background color: rgb(${bgR},${bgG},${bgB})`);
    } else {
      bgR = 245; bgG = 245; bgB = 245;
      console.log('[codeBasedMask] No bg detected at corners, using default white');
    }

    const isSimilarToBg = (x: number, y: number): boolean => {
      const i = idx(x, y);
      const dr = Math.abs(pixels[i] - bgR);
      const dg = Math.abs(pixels[i + 1] - bgG);
      const db = Math.abs(pixels[i + 2] - bgB);
      return dr <= bgThreshold && dg <= bgThreshold && db <= bgThreshold && isLightBg(x, y);
    };

    // BFS flood fill from edges
    const queue: number[] = [];
    for (let x = 0; x < width; x++) {
      if (isSimilarToBg(x, 0)) { queue.push(x, 0); visited[pixIdx(x, 0)] = 1; }
      if (isSimilarToBg(x, height - 1)) { queue.push(x, height - 1); visited[pixIdx(x, height - 1)] = 1; }
    }
    for (let y = 0; y < height; y++) {
      if (!visited[pixIdx(0, y)] && isSimilarToBg(0, y)) { queue.push(0, y); visited[pixIdx(0, y)] = 1; }
      if (!visited[pixIdx(width-1, y)] && isSimilarToBg(width-1, y)) { queue.push(width-1, y); visited[pixIdx(width-1, y)] = 1; }
    }

    let qi = 0;
    while (qi < queue.length) {
      const x = queue[qi++];
      const y = queue[qi++];
      mask[pixIdx(x, y)] = 0; // Background → black in mask

      const neighbors = [[x-1,y],[x+1,y],[x,y-1],[x,y+1]];
      for (const [nx, ny] of neighbors) {
        if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
          const npi = pixIdx(nx, ny);
          if (!visited[npi] && isSimilarToBg(nx, ny)) {
            visited[npi] = 1;
            queue.push(nx, ny);
          }
        }
      }
    }

    const bgRemoved = queue.length / 2;
    console.log(`[codeBasedMask] Phase 1: Removed ${bgRemoved} background pixels`);

    // ========== PHASE 2: Detect mannequin skin ==========
    console.log('[codeBasedMask] Phase 2: Mannequin skin detection...');
    
    let skinRemoved = 0;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const pi = pixIdx(x, y);
        if (mask[pi] === 0) continue; // Already removed as background

        const i = idx(x, y);
        const r = pixels[i], g = pixels[i + 1], b = pixels[i + 2];
        
        // Convert to HSV
        const rn = r / 255, gn = g / 255, bn = b / 255;
        const cmax = Math.max(rn, gn, bn);
        const cmin = Math.min(rn, gn, bn);
        const delta = cmax - cmin;
        
        let h = 0;
        if (delta > 0) {
          if (cmax === rn) h = 60 * (((gn - bn) / delta) % 6);
          else if (cmax === gn) h = 60 * ((bn - rn) / delta + 2);
          else h = 60 * ((rn - gn) / delta + 4);
        }
        if (h < 0) h += 360;
        
        const s = cmax === 0 ? 0 : (delta / cmax) * 100;
        const v = cmax * 100;

        // Mannequin skin detection:
        // The beige/tan mannequin has:
        // - Hue: 15-45 (warm beige/peach range)
        // - Saturation: 8-45 (low-medium, matte plastic)
        // - Value: 55-95 (medium to bright)
        // Also catch lighter skin areas with very low saturation
        const isMannequinSkin = (
          (h >= 10 && h <= 50) &&   // Warm hue range (beige/peach/tan)
          (s >= 5 && s <= 48) &&     // Low-medium saturation  
          (v >= 50 && v <= 96)       // Not too dark, not pure white
        );

        // Also catch very desaturated warm tones (shadows on mannequin)
        const isMannequinShadow = (
          (h >= 5 && h <= 55) &&
          (s >= 3 && s <= 25) &&
          (v >= 35 && v <= 65)
        );

        // Also detect near-white mannequin highlights
        const isMannequinHighlight = (
          (s < 12) &&
          (v > 82 && v < 98) &&
          (r > 200 && g > 190 && b > 175) &&
          (r - b < 40) // Not too warm = not clothing
        );

        if (isMannequinSkin || isMannequinShadow || isMannequinHighlight) {
          mask[pi] = 0;
          skinRemoved++;
        }
      }
    }
    
    console.log(`[codeBasedMask] Phase 2: Removed ${skinRemoved} mannequin skin pixels`);

    // ========== PHASE 3: Morphological cleanup ==========
    console.log('[codeBasedMask] Phase 3: Morphological cleanup...');
    
    // Remove small noise (isolated white pixels) - simple erosion then dilation
    const cleanMask = new Uint8Array(mask);
    
    // Pass 1: Remove small white spots (if surrounded by mostly black)
    for (let y = 2; y < height - 2; y++) {
      for (let x = 2; x < width - 2; x++) {
        if (mask[pixIdx(x, y)] === 255) {
          let whiteNeighbors = 0;
          let totalChecked = 0;
          for (let dy = -2; dy <= 2; dy++) {
            for (let dx = -2; dx <= 2; dx++) {
              if (dx === 0 && dy === 0) continue;
              totalChecked++;
              if (mask[pixIdx(x + dx, y + dy)] === 255) whiteNeighbors++;
            }
          }
          // If less than 40% neighbors are white, this is noise
          if (whiteNeighbors < totalChecked * 0.4) {
            cleanMask[pixIdx(x, y)] = 0;
          }
        }
      }
    }

    // Pass 2: Fill small black holes (if surrounded by mostly white)
    for (let y = 2; y < height - 2; y++) {
      for (let x = 2; x < width - 2; x++) {
        if (cleanMask[pixIdx(x, y)] === 0 && !visited[pixIdx(x, y)]) {
          // This was NOT background (not flood-filled), check if it's a hole in clothing
          let whiteNeighbors = 0;
          let totalChecked = 0;
          for (let dy = -2; dy <= 2; dy++) {
            for (let dx = -2; dx <= 2; dx++) {
              if (dx === 0 && dy === 0) continue;
              totalChecked++;
              if (cleanMask[pixIdx(x + dx, y + dy)] === 255) whiteNeighbors++;
            }
          }
          // If more than 60% neighbors are white, fill this hole
          if (whiteNeighbors > totalChecked * 0.6) {
            cleanMask[pixIdx(x, y)] = 255;
          }
        }
      }
    }

    // Count final stats
    let finalWhite = 0, finalBlack = 0;
    for (let i = 0; i < cleanMask.length; i++) {
      if (cleanMask[i] === 255) finalWhite++;
      else finalBlack++;
    }
    console.log(`[codeBasedMask] Final mask: ${finalWhite} white (clothing), ${finalBlack} black (bg+skin)`);
    console.log(`[codeBasedMask] Clothing ratio: ${(finalWhite / (width * height) * 100).toFixed(1)}%`);

    // Create output mask image (grayscale → RGBA for PNG)
    const outputPixels = new Uint8Array(width * height * 4);
    for (let i = 0; i < cleanMask.length; i++) {
      const v = cleanMask[i];
      outputPixels[i * 4] = v;     // R
      outputPixels[i * 4 + 1] = v; // G
      outputPixels[i * 4 + 2] = v; // B
      outputPixels[i * 4 + 3] = 255; // A (fully opaque)
    }

    const outputBuffer = await sharp(Buffer.from(outputPixels), {
      raw: { width, height, channels: 4 },
    })
      .png()
      .toBuffer();

    console.log('[codeBasedMask] ✅ Code-based clothing mask created successfully');
    return `data:image/png;base64,${outputBuffer.toString('base64')}`;
  } catch (error: any) {
    console.error('[codeBasedMask] Error:', error.message);
    throw error;
  }
}

/**
 * Remove background using flood-fill from edges.
 * This handles white, gray, and light-colored backgrounds.
 * It starts from the image edges and flood-fills inward,
 * removing any "uniform" background color.
 */
export async function removeWhiteBackground(
  base64Data: string,
  threshold: number = 30 // Color similarity threshold for flood fill (0-255)
): Promise<string> {
  console.log('[removeBackground] Starting edge-based background removal...');
  
  const base64 = base64Data.replace(/^data:image\/\w+;base64,/, '');
  const inputBuffer = Buffer.from(base64, 'base64');

  try {
    const { data, info } = await sharp(inputBuffer)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const width = info.width;
    const height = info.height;
    const pixels = new Uint8Array(data);
    const visited = new Uint8Array(width * height); // 0 = not visited, 1 = visited

    // Helper to get pixel index
    const idx = (x: number, y: number) => (y * width + x) * 4;
    const pixIdx = (x: number, y: number) => y * width + x;

    // Check if two pixels are similar enough (background-like)
    const isSimilar = (x1: number, y1: number, r2: number, g2: number, b2: number): boolean => {
      const i = idx(x1, y1);
      const dr = Math.abs(pixels[i] - r2);
      const dg = Math.abs(pixels[i + 1] - g2);
      const db = Math.abs(pixels[i + 2] - b2);
      return dr <= threshold && dg <= threshold && db <= threshold;
    };

    // Check if pixel is "light" enough to be background (R,G,B all > 180 and similar to each other)
    const isLightBackground = (x: number, y: number): boolean => {
      const i = idx(x, y);
      const r = pixels[i], g = pixels[i + 1], b = pixels[i + 2];
      const min = Math.min(r, g, b);
      const max = Math.max(r, g, b);
      // Light and low saturation (grayish/whitish)
      return min > 160 && (max - min) < 50;
    };

    // Sample background color from corners
    const corners = [
      [0, 0], [width - 1, 0], [0, height - 1], [width - 1, height - 1],
      [Math.floor(width / 2), 0], [Math.floor(width / 2), height - 1],
      [0, Math.floor(height / 2)], [width - 1, Math.floor(height / 2)],
    ];
    
    // Find the most common corner color as background reference
    let bgR = 0, bgG = 0, bgB = 0, bgCount = 0;
    for (const [cx, cy] of corners) {
      if (isLightBackground(cx, cy)) {
        const i = idx(cx, cy);
        bgR += pixels[i];
        bgG += pixels[i + 1];
        bgB += pixels[i + 2];
        bgCount++;
      }
    }
    
    if (bgCount === 0) {
      console.log('[removeBackground] No light background detected at corners, skipping');
      return base64Data;
    }
    
    bgR = Math.round(bgR / bgCount);
    bgG = Math.round(bgG / bgCount);
    bgB = Math.round(bgB / bgCount);
    console.log(`[removeBackground] Background color: rgb(${bgR}, ${bgG}, ${bgB})`);

    // BFS flood fill from all edges
    const queue: number[] = []; // flat array of [x, y] pairs

    // Add all edge pixels to queue
    for (let x = 0; x < width; x++) {
      // Top edge
      if (isSimilar(x, 0, bgR, bgG, bgB) && isLightBackground(x, 0)) {
        queue.push(x, 0);
        visited[pixIdx(x, 0)] = 1;
      }
      // Bottom edge
      if (isSimilar(x, height - 1, bgR, bgG, bgB) && isLightBackground(x, height - 1)) {
        queue.push(x, height - 1);
        visited[pixIdx(x, height - 1)] = 1;
      }
    }
    for (let y = 0; y < height; y++) {
      // Left edge
      if (!visited[pixIdx(0, y)] && isSimilar(0, y, bgR, bgG, bgB) && isLightBackground(0, y)) {
        queue.push(0, y);
        visited[pixIdx(0, y)] = 1;
      }
      // Right edge
      if (!visited[pixIdx(width - 1, y)] && isSimilar(width - 1, y, bgR, bgG, bgB) && isLightBackground(width - 1, y)) {
        queue.push(width - 1, y);
        visited[pixIdx(width - 1, y)] = 1;
      }
    }

    // BFS flood fill
    let qi = 0;
    while (qi < queue.length) {
      const x = queue[qi++];
      const y = queue[qi++];

      // Make this pixel transparent
      const pi = idx(x, y);
      pixels[pi + 3] = 0;

      // Check 4-connected neighbors
      const neighbors = [[x-1,y],[x+1,y],[x,y-1],[x,y+1]];
      for (const [nx, ny] of neighbors) {
        if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
          const npi = pixIdx(nx, ny);
          if (!visited[npi] && isSimilar(nx, ny, bgR, bgG, bgB) && isLightBackground(nx, ny)) {
            visited[npi] = 1;
            queue.push(nx, ny);
          }
        }
      }
    }

    const removedCount = queue.length / 2;
    const totalPixels = width * height;
    console.log(`[removeBackground] Removed ${removedCount}/${totalPixels} pixels (${Math.round(removedCount/totalPixels*100)}%)`);

    // Anti-alias edges: soften alpha on border pixels
    const output = new Uint8Array(pixels);
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const pi = idx(x, y);
        if (output[pi + 3] > 0) {
          // Count transparent neighbors
          let transparentNeighbors = 0;
          const nbs = [[x-1,y],[x+1,y],[x,y-1],[x,y+1]];
          for (const [nx, ny] of nbs) {
            if (pixels[idx(nx, ny) + 3] === 0) transparentNeighbors++;
          }
          // If this pixel borders transparent pixels, partially fade it
          if (transparentNeighbors > 0 && transparentNeighbors < 4) {
            output[pi + 3] = Math.round(output[pi + 3] * (1 - transparentNeighbors * 0.15));
          }
        }
      }
    }

    const outputBuffer = await sharp(Buffer.from(output), {
      raw: { width, height, channels: 4 },
    })
      .png()
      .toBuffer();

    console.log('[removeBackground] Background removed successfully');
    return `data:image/png;base64,${outputBuffer.toString('base64')}`;
  } catch (error: any) {
    console.error('[removeBackground] Error:', error.message);
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
 * Apply a mask to an image with grayscale support and edge feathering.
 * 
 * The mask is interpreted as GRAYSCALE brightness:
 * - Bright/White pixels (>128) = clothing → keep from original (alpha proportional to brightness)
 * - Dark/Black pixels (<128) = mannequin/background → make transparent
 * - Gray pixels = partial transparency (smooth edges)
 * 
 * This handles masks that aren't perfectly black & white.
 */
export async function applyMaskToImage(
  originalBase64: string,
  maskBase64: string,
  options: { threshold?: number; featherRadius?: number } = {}
): Promise<string> {
  const { threshold = 128, featherRadius = 2 } = options;
  console.log(`[applyMaskToImage] Applying mask (threshold=${threshold}, feather=${featherRadius})...`);
  
  const originalData = originalBase64.replace(/^data:image\/\w+;base64,/, '');
  const maskData = maskBase64.replace(/^data:image\/\w+;base64,/, '');
  
  const originalBuffer = Buffer.from(originalData, 'base64');
  const maskBuffer = Buffer.from(maskData, 'base64');

  try {
    const originalMeta = await sharp(originalBuffer).metadata();
    const width = originalMeta.width || 512;
    const height = originalMeta.height || 512;

    // Resize mask to match original, then blur slightly for smoother edges
    let maskPipeline = sharp(maskBuffer)
      .resize(width, height, { fit: 'fill' })
      .grayscale(); // Convert to grayscale for consistent brightness interpretation
    
    // Apply slight blur for edge feathering
    if (featherRadius > 0) {
      const sigma = featherRadius * 0.8;
      maskPipeline = maskPipeline.blur(sigma);
    }

    const { data: maskGrayData } = await maskPipeline
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const { data: originalPixels, info } = await sharp(originalBuffer)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const outputPixels = new Uint8Array(originalPixels);
    const maskPixels = new Uint8Array(maskGrayData);
    
    let keptPixels = 0;
    let removedPixels = 0;
    let partialPixels = 0;

    for (let i = 0; i < info.width * info.height; i++) {
      const pixelIndex = i * 4;
      
      // Use grayscale brightness from mask (R channel after grayscale conversion)
      const maskBrightness = maskPixels[pixelIndex]; // 0-255
      const maskAlpha = maskPixels[pixelIndex + 3];
      
      // Combine brightness and alpha
      const effectiveBrightness = Math.round((maskBrightness / 255) * (maskAlpha / 255) * 255);
      
      if (effectiveBrightness > threshold + 30) {
        // Clearly clothing - keep with full alpha
        keptPixels++;
      } else if (effectiveBrightness < threshold - 30) {
        // Clearly background - make transparent
        outputPixels[pixelIndex + 3] = 0;
        removedPixels++;
      } else {
        // Edge zone - partial transparency for smooth transition
        const edgeAlpha = Math.round(((effectiveBrightness - (threshold - 30)) / 60) * 255);
        outputPixels[pixelIndex + 3] = Math.min(outputPixels[pixelIndex + 3], Math.max(0, edgeAlpha));
        partialPixels++;
      }
    }

    console.log(`[applyMaskToImage] Kept: ${keptPixels}, Removed: ${removedPixels}, Partial: ${partialPixels}`);

    const outputBuffer = await sharp(Buffer.from(outputPixels), {
      raw: { width: info.width, height: info.height, channels: 4 },
    })
      .png()
      .toBuffer();

    console.log('[applyMaskToImage] Mask applied successfully with feathered edges');
    return `data:image/png;base64,${outputBuffer.toString('base64')}`;
  } catch (error: any) {
    console.error('[applyMaskToImage] Error:', error.message);
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
