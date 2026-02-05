import { NextRequest } from 'next/server';
import { readColumnData } from '@/lib/excel-reader';
import { generateImageFromPrompt, dressManneqin, extractClothingWithReference, generateSegmentationMask } from '@/lib/openrouter';
import { saveBase64Image, readImageAsBase64, getPublicUrl, ensureDir, sanitizeFileName, applyMaskToImage, convertGreenToTransparent } from '@/lib/image-utils';
import path from 'path';
import fs from 'fs';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

function replaceAllVariables(prompt: string, value: string): string {
  return prompt.replace(/\{\{[^}]+\}\}/g, value);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const {
    excelPath, imageGenModel, visionModel,
    step1Sheet, step1PromptCol,
    step2Sheet, step2PromptCol, step2VariableCol, step2Images,
    step3Sheet, step3PromptCol, step3Images,
    step4Sheet, step4PromptCol, step4VariableCol,
    step5Sheet, step5FolderCol, step5FileCol, step5BasePath,
    rowMode, rowStart, rowEnd, rowCount,
  } = body;

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: any) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));

      try {
        send({ type: 'progress', message: 'Reading Excel...', progress: 0 });

        // Step 1 data
        let step1Items = readColumnData(excelPath, step1Sheet, step1PromptCol);
        if (rowMode === 'count' && rowCount) step1Items = step1Items.slice(0, rowCount);
        else if (rowMode === 'range' && rowStart && rowEnd) step1Items = step1Items.filter((_, idx) => idx + 1 >= rowStart && idx + 1 <= rowEnd);

        send({ type: 'progress', message: `Found ${step1Items.length} items`, progress: 2 });
        if (step1Items.length === 0) { send({ type: 'error', message: 'No items' }); controller.close(); return; }

        // Step 2 data
        let step2Prompts: string[] = [];
        let step2Variables: string[] = [];
        try {
          step2Prompts = readColumnData(excelPath, step2Sheet, step2PromptCol).map((d) => d.prompt);
          step2Variables = readColumnData(excelPath, step2Sheet, step2VariableCol).map((d) => d.prompt);
          send({ type: 'progress', message: `Step 2: ${step2Prompts.length} prompts`, progress: 3 });
        } catch {}

        // Step 3 data
        let step3Prompts: string[] = [];
        try {
          step3Prompts = readColumnData(excelPath, step3Sheet, step3PromptCol).map((d) => d.prompt);
          send({ type: 'progress', message: `Step 3: ${step3Prompts.length} prompts`, progress: 4 });
        } catch {}

        // Step 4 data
        let step4Prompts: string[] = [];
        let step4Variables: string[] = [];
        try {
          step4Prompts = readColumnData(excelPath, step4Sheet, step4PromptCol).map((d) => d.prompt);
          if (step4VariableCol) {
            step4Variables = readColumnData(excelPath, step4Sheet, step4VariableCol).map((d) => d.prompt);
          }
          send({ type: 'progress', message: `Step 4: ${step4Prompts.length} prompts`, progress: 5 });
        } catch {}

        // Step 5 data
        let step5Data: { folder: string; filename: string }[] = [];
        try {
          const folderData = readColumnData(excelPath, step5Sheet, step5FolderCol);
          const fileData = readColumnData(excelPath, step5Sheet, step5FileCol);
          for (let i = 0; i < Math.min(folderData.length, fileData.length); i++) {
            step5Data.push({ folder: sanitizeFileName(folderData[i].prompt || `folder_${i}`), filename: sanitizeFileName(fileData[i].prompt || `file_${i}`) });
          }
          send({ type: 'progress', message: `Step 5: ${step5Data.length} paths`, progress: 6 });
        } catch {}

        // Load images
        const mannequinImages: string[] = [];
        if (step2Images?.length > 0) {
          send({ type: 'progress', message: `Loading ${step2Images.length} mannequin images...`, progress: 7 });
          for (const p of step2Images) { 
            try { 
              console.log(`[Step2] Loading image: ${p}`);
              const img = readImageAsBase64(p);
              mannequinImages.push(img);
              console.log(`[Step2] Loaded image: ${p} (${img.length} bytes)`);
            } catch (err: any) {
              console.error(`[Step2] Failed to load image ${p}:`, err.message);
              send({ type: 'progress', message: `⚠️ Failed to load: ${p}`, progress: 7 });
            }
          }
          send({ type: 'progress', message: `✓ Loaded ${mannequinImages.length}/${step2Images.length} mannequin images`, progress: 7 });
        } else {
          send({ type: 'progress', message: `⚠️ No mannequin images provided`, progress: 7 });
        }

        const referenceImages: string[] = [];
        if (step3Images?.length > 0) {
          send({ type: 'progress', message: `Loading ${step3Images.length} reference images...`, progress: 8 });
          for (const p of step3Images) { 
            try { 
              console.log(`[Step3] Loading image: ${p}`);
              const img = readImageAsBase64(p);
              referenceImages.push(img);
              console.log(`[Step3] Loaded image: ${p} (${img.length} bytes)`);
            } catch (err: any) {
              console.error(`[Step3] Failed to load image ${p}:`, err.message);
              send({ type: 'progress', message: `⚠️ Failed to load: ${p}`, progress: 8 });
            }
          }
          send({ type: 'progress', message: `✓ Loaded ${referenceImages.length}/${step3Images.length} reference images`, progress: 8 });
        } else {
          send({ type: 'progress', message: `⚠️ No reference images provided`, progress: 8 });
        }

        send({ type: 'progress', message: 'Starting...', progress: 10 });

        const totalItems = step1Items.length;
        const stepsPerItem = 5;
        let completedSteps = 0;

        // Detect if filesystem is writable (serverless = read-only)
        let outputBase = './public/output';
        try {
          const testDir = path.resolve('./public/output');
          if (!fs.existsSync(testDir)) fs.mkdirSync(testDir, { recursive: true });
          const testFile = path.join(testDir, '.test');
          fs.writeFileSync(testFile, '');
          fs.unlinkSync(testFile);
        } catch {
          outputBase = '/tmp/output';
          console.log('[Process] Serverless detected, using /tmp/output');
        }

        for (let i = 0; i < step1Items.length; i++) {
          const item = step1Items[i];
          const itemName = sanitizeFileName(item.name || `Item_${i + 1}`);
          const tempDir = `${outputBase}/${itemName}`;
          ensureDir(tempDir);

          send({ type: 'item_start', itemIndex: i, itemName: item.name, message: `Processing ${i + 1}/${totalItems}: ${item.name}` });

          let step1Image = '', step2Image = '', step3Image = '', step4Image = '';

          try {
            // STEP 1: Generate
            send({ type: 'step_start', itemIndex: i, step: 1, message: `[${item.name}] Step 1: Generating...` });
            step1Image = await generateImageFromPrompt(item.prompt, imageGenModel || 'google/gemini-2.5-flash-image');
            const step1Path = saveBase64Image(step1Image, tempDir, `${itemName}_step1`);
            completedSteps++;
            send({ type: 'step_complete', itemIndex: i, step: 1, imageUrl: getPublicUrl(step1Path), message: `[${item.name}] Step 1 ✓`, progress: 10 + (completedSteps / (totalItems * stepsPerItem)) * 85 });

            // STEP 2: Dress
            if (mannequinImages.length > 0 || step2Prompts[i]) {
              send({ type: 'step_start', itemIndex: i, step: 2, message: `[${item.name}] Step 2: Dressing with ${mannequinImages.length} reference images...` });
              let prompt = step2Prompts[i] || 'Place clothing on mannequin naturally.';
              prompt = replaceAllVariables(prompt, step2Variables[i] || '');
              console.log(`[Step 2] Sending ${mannequinImages.length} mannequin images to dressManneqin`);
              step2Image = await dressManneqin(step1Image, mannequinImages, prompt, visionModel || 'google/gemini-2.5-flash', imageGenModel);
              const step2Path = saveBase64Image(step2Image, tempDir, `${itemName}_step2`);
              completedSteps++;
              send({ type: 'step_complete', itemIndex: i, step: 2, imageUrl: getPublicUrl(step2Path), message: `[${item.name}] Step 2 ✓ (${mannequinImages.length} refs)`, progress: 10 + (completedSteps / (totalItems * stepsPerItem)) * 85 });
            } else {
              step2Image = step1Image;
              completedSteps++;
              send({ type: 'step_skip', itemIndex: i, step: 2, message: `[${item.name}] Step 2 skipped` });
            }

            // STEP 3: Extract clothing (generate on transparent background)
            send({ type: 'step_start', itemIndex: i, step: 3, message: `[${item.name}] Step 3: Extracting clothing...` });
            
            // Use clothing description from step2Variables (Column E)
            const clothingDescription = step2Variables[i] || 'clothing';
            console.log(`[Step 3] Clothing description: ${clothingDescription}`);
            
            step3Image = await generateSegmentationMask(step2Image, referenceImages, clothingDescription, visionModel || 'google/gemini-2.5-flash', imageGenModel);
            
            const step3Path = saveBase64Image(step3Image, tempDir, `${itemName}_step3`);
            completedSteps++;
            send({ type: 'step_complete', itemIndex: i, step: 3, imageUrl: getPublicUrl(step3Path), message: `[${item.name}] Step 3 ✓ Extracted: ${clothingDescription}`, progress: 10 + (completedSteps / (totalItems * stepsPerItem)) * 85 });

            // STEP 4: Use Step 3 result directly (already extracted)
            send({ type: 'step_start', itemIndex: i, step: 4, message: `[${item.name}] Step 4: Finalizing...` });
            
            // Step 3 already generated clothing on transparent background
            // Just use it directly
            step4Image = step3Image;
            
            const step4Path = saveBase64Image(step4Image, tempDir, `${itemName}_step4`);
            completedSteps++;
            send({ type: 'step_complete', itemIndex: i, step: 4, imageUrl: getPublicUrl(step4Path), message: `[${item.name}] Step 4 ✓ Ready`, progress: 10 + (completedSteps / (totalItems * stepsPerItem)) * 85 });

            // STEP 5: Save
            if (step5Data[i]) {
              send({ type: 'step_start', itemIndex: i, step: 5, message: `[${item.name}] Step 5: Saving...` });
              const { folder, filename } = step5Data[i];
              const basePath = outputBase.startsWith('/tmp') ? '/tmp/output' : (step5BasePath || './public/output');
              const folderPath = path.join(basePath, folder);
              ensureDir(folderPath);
              const savedPath = saveBase64Image(step4Image, folderPath, filename);
              completedSteps++;
              
              // On Vercel, return base64 data URL for download
              const downloadUrl = getPublicUrl(savedPath);
              send({ type: 'step_complete', itemIndex: i, step: 5, savedPath: `${folder}/${filename}.png`, downloadUrl, message: `[${item.name}] Saved: ${folder}/${filename}.png`, progress: 10 + (completedSteps / (totalItems * stepsPerItem)) * 85 });
            } else {
              completedSteps++;
              send({ type: 'step_skip', itemIndex: i, step: 5, message: `[${item.name}] Step 5 skipped` });
            }

            send({ type: 'item_complete', itemIndex: i, itemName: item.name, message: `✓ ${item.name} complete` });
          } catch (err: any) {
            completedSteps += stepsPerItem;
            send({ type: 'item_error', itemIndex: i, itemName: item.name, error: err.message, message: `✗ ${item.name}: ${err.message}`, progress: 10 + (completedSteps / (totalItems * stepsPerItem)) * 85 });
          }
        }

        send({ type: 'done', message: `🎉 Complete! ${step1Items.length} items.`, progress: 100 });
      } catch (err: any) {
        send({ type: 'error', message: err.message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' } });
}
