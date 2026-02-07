import { NextRequest } from 'next/server';
import { readColumnData } from '@/lib/excel-reader';
import { generateImageFromPrompt, extractClothingFromImage, createClothingMask, finalClothingExtraction } from '@/lib/replicate';
import { saveBase64Image, readImageAsBase64, getPublicUrl, ensureDir, sanitizeFileName } from '@/lib/image-utils';
import path from 'path';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

function replaceAllVariables(prompt: string, value: string): string {
  return prompt.replace(/\{\{[^}]+\}\}/g, value);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const {
    excelPath,
    step1Sheet, step1PromptCol,
    step2Sheet, step2PromptCol, step2VariableCol, step2Images,
    step3Sheet, step3PromptCol, step3VariableCol, step3Images,
    step4Sheet, step4PromptCol, step4VariableCol,
    step5Sheet, step5FolderCol, step5FileCol,
    rowMode, rowStart, rowEnd, rowCount,
  } = body;

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: any) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));

      try {
        send({ type: 'progress', message: 'Reading Excel...', progress: 0 });

        // ===== Read Excel data =====

        // Step 1 (Column E from "Prompt to gen data")
        let step1Items = readColumnData(excelPath, step1Sheet, step1PromptCol);
        if (rowMode === 'count' && rowCount) step1Items = step1Items.slice(0, rowCount);
        else if (rowMode === 'range' && rowStart && rowEnd) step1Items = step1Items.filter((_, idx) => idx + 1 >= rowStart && idx + 1 <= rowEnd);

        send({ type: 'progress', message: `Found ${step1Items.length} items`, progress: 2 });
        if (step1Items.length === 0) { send({ type: 'error', message: 'No items' }); controller.close(); return; }

        // Step 2 (Column G + Variable E from "Woman-Category...")
        let step2Prompts: string[] = [];
        let step2Variables: string[] = [];
        try {
          step2Prompts = readColumnData(excelPath, step2Sheet, step2PromptCol).map((d) => d.prompt);
          step2Variables = readColumnData(excelPath, step2Sheet, step2VariableCol).map((d) => d.prompt);
          send({ type: 'progress', message: `Step 2: ${step2Prompts.length} prompts (Col G)`, progress: 3 });
        } catch {}

        // Step 3 (Column J + Variable E)
        let step3Prompts: string[] = [];
        let step3Variables: string[] = [];
        try {
          step3Prompts = readColumnData(excelPath, step3Sheet, step3PromptCol).map((d) => d.prompt);
          if (step3VariableCol) step3Variables = readColumnData(excelPath, step3Sheet, step3VariableCol).map((d) => d.prompt);
          send({ type: 'progress', message: `Step 3: ${step3Prompts.length} prompts (Col J)`, progress: 4 });
        } catch {}

        // Step 4 (Column I + Variable E)
        let step4Prompts: string[] = [];
        let step4Variables: string[] = [];
        try {
          step4Prompts = readColumnData(excelPath, step4Sheet, step4PromptCol).map((d) => d.prompt);
          if (step4VariableCol) step4Variables = readColumnData(excelPath, step4Sheet, step4VariableCol).map((d) => d.prompt);
          send({ type: 'progress', message: `Step 4: ${step4Prompts.length} prompts (Col I)`, progress: 5 });
        } catch {}

        // Step 5 (Save paths from "Prompt to gen data" Col D + Col A)
        let step5Data: { folder: string; filename: string }[] = [];
        try {
          const folderData = readColumnData(excelPath, step5Sheet, step5FolderCol);
          const fileData = readColumnData(excelPath, step5Sheet, step5FileCol);
          for (let i = 0; i < Math.min(folderData.length, fileData.length); i++) {
            step5Data.push({ folder: sanitizeFileName(folderData[i].prompt || `folder_${i}`), filename: sanitizeFileName(fileData[i].prompt || `file_${i}`) });
          }
          send({ type: 'progress', message: `Step 5: ${step5Data.length} save paths`, progress: 6 });
        } catch {}

        // ===== Load reference images =====

        // Mannequin images for Step 2 (model-1, model-2, model-3)
        const mannequinImages: string[] = [];
        if (step2Images?.length > 0) {
          for (const p of step2Images) {
            try {
              mannequinImages.push(readImageAsBase64(p));
              console.log(`[Load] Step 2 mannequin: ${p} ✓`);
            } catch (err: any) {
              console.error(`[Load] Step 2 mannequin failed: ${p}`, err.message);
            }
          }
          send({ type: 'progress', message: `✓ ${mannequinImages.length} mannequin images loaded`, progress: 7 });
        }

        // Reference images for Step 3 (model-3 or others)
        const referenceImages: string[] = [];
        if (step3Images?.length > 0) {
          for (const p of step3Images) {
            try {
              referenceImages.push(readImageAsBase64(p));
              console.log(`[Load] Step 3 reference: ${p} ✓`);
            } catch (err: any) {
              console.error(`[Load] Step 3 reference failed: ${p}`, err.message);
            }
          }
          send({ type: 'progress', message: `✓ ${referenceImages.length} reference images loaded`, progress: 8 });
        }

        send({ type: 'progress', message: 'Starting pipeline (nano-banana-pro)', progress: 10 });

        // ===== Process items =====
        const totalItems = step1Items.length;
        const stepsPerItem = 5;
        let completedSteps = 0;
        const outputBase = '/tmp/output';

        for (let i = 0; i < step1Items.length; i++) {
          const item = step1Items[i];
          const itemName = sanitizeFileName(item.name || `Item_${i + 1}`);
          const tempDir = `${outputBase}/${itemName}`;
          ensureDir(tempDir);

          send({ type: 'item_start', itemIndex: i, itemName: item.name, message: `Processing ${i + 1}/${totalItems}: ${item.name}` });

          let step1Image = '', step2Image = '', step3Image = '', step4Image = '';

          try {
            // ==================== STEP 1: Generate (Excel Col E) ====================
            const step1Prompt = item.prompt;
            console.log(`\n${'#'.repeat(60)}`);
            console.log(`[Item ${i + 1}/${totalItems}] ${item.name}`);
            console.log(`${'#'.repeat(60)}`);

            send({ type: 'step_start', itemIndex: i, step: 1, message: `[${item.name}] Step 1: Generating...`, prompt: step1Prompt });
            step1Image = await generateImageFromPrompt(step1Prompt);
            const step1Path = saveBase64Image(step1Image, tempDir, `${itemName}_step1`);
            completedSteps++;
            send({ type: 'step_complete', itemIndex: i, step: 1, imageUrl: getPublicUrl(step1Path), message: `[${item.name}] Step 1 ✓`, progress: 10 + (completedSteps / (totalItems * stepsPerItem)) * 85 });

            // ==================== STEP 2: Dress Mannequin (Excel Col G) ====================
            // image=Step1, image_2=model-1, image_3=model-2, image_4=model-3
            if (step2Prompts[i]) {
              let step2Prompt = replaceAllVariables(step2Prompts[i], step2Variables[i] || '');
              console.log(`[Step 2] Prompt: "${step2Prompt.substring(0, 150)}..."`);
              console.log(`[Step 2] Images: Step1 + ${mannequinImages.length} mannequin refs`);

              send({ type: 'step_start', itemIndex: i, step: 2, message: `[${item.name}] Step 2: Dressing mannequin...`, prompt: step2Prompt });
              step2Image = await extractClothingFromImage(step1Image, mannequinImages, step2Prompt);
              const step2Path = saveBase64Image(step2Image, tempDir, `${itemName}_step2`);
              completedSteps++;
              send({ type: 'step_complete', itemIndex: i, step: 2, imageUrl: getPublicUrl(step2Path), message: `[${item.name}] Step 2 ✓`, progress: 10 + (completedSteps / (totalItems * stepsPerItem)) * 85 });
            } else {
              step2Image = step1Image;
              completedSteps++;
              send({ type: 'step_skip', itemIndex: i, step: 2, message: `[${item.name}] Step 2 skipped (no prompt)` });
            }

            // ==================== STEP 3: Create Mask (Excel Col J) ====================
            // image=Step2, image_2+=model refs
            if (step3Prompts[i]) {
              let step3Prompt = replaceAllVariables(step3Prompts[i], step3Variables[i] || '');
              console.log(`[Step 3] Prompt: "${step3Prompt.substring(0, 150)}..."`);
              console.log(`[Step 3] Images: Step2 + ${referenceImages.length} model refs`);

              send({ type: 'step_start', itemIndex: i, step: 3, message: `[${item.name}] Step 3: Creating mask...`, prompt: step3Prompt });
              step3Image = await createClothingMask(step2Image, referenceImages, step3Prompt);
              const step3Path = saveBase64Image(step3Image, tempDir, `${itemName}_step3`);
              completedSteps++;
              send({ type: 'step_complete', itemIndex: i, step: 3, imageUrl: getPublicUrl(step3Path), message: `[${item.name}] Step 3 ✓`, progress: 10 + (completedSteps / (totalItems * stepsPerItem)) * 85 });
            } else {
              completedSteps++;
              send({ type: 'step_skip', itemIndex: i, step: 3, message: `[${item.name}] Step 3 skipped (no prompt)` });
            }

            // ==================== STEP 4: Final Extraction (Excel Col I) ====================
            // image=Step2, image_2=Step3 mask
            if (step4Prompts[i] && step2Image && step3Image) {
              let step4Prompt = replaceAllVariables(step4Prompts[i], step4Variables[i] || '');
              console.log(`[Step 4] Prompt: "${step4Prompt.substring(0, 150)}..."`);
              console.log(`[Step 4] Images: Step2 + Step3 mask`);

              send({ type: 'step_start', itemIndex: i, step: 4, message: `[${item.name}] Step 4: Extracting...`, prompt: step4Prompt });
              step4Image = await finalClothingExtraction(step2Image, step3Image, step4Prompt);
              const step4Path = saveBase64Image(step4Image, tempDir, `${itemName}_step4`);
              completedSteps++;
              send({ type: 'step_complete', itemIndex: i, step: 4, imageUrl: getPublicUrl(step4Path), message: `[${item.name}] Step 4 ✓`, progress: 10 + (completedSteps / (totalItems * stepsPerItem)) * 85 });
            } else {
              step4Image = step2Image;
              completedSteps++;
              send({ type: 'step_skip', itemIndex: i, step: 4, message: `[${item.name}] Step 4 skipped` });
            }

            // ==================== STEP 5: Save ====================
            const finalImage = step4Image || step2Image || step1Image;
            if (step5Data[i]) {
              send({ type: 'step_start', itemIndex: i, step: 5, message: `[${item.name}] Step 5: Saving...` });
              const { folder, filename } = step5Data[i];
              const folderPath = path.join('/tmp/output', folder);
              ensureDir(folderPath);
              const savedPath = saveBase64Image(finalImage, folderPath, filename);
              completedSteps++;
              send({ type: 'step_complete', itemIndex: i, step: 5, savedPath: `${folder}/${filename}.png`, downloadUrl: getPublicUrl(savedPath), message: `[${item.name}] Saved: ${folder}/${filename}.png`, progress: 10 + (completedSteps / (totalItems * stepsPerItem)) * 85 });
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
