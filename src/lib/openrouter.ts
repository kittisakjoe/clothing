import fs from 'fs';
import path from 'path';

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';

interface OpenRouterImageEntry {
  type: 'image_url';
  image_url: { url: string };
}

interface ContentBlock {
  type: 'text' | 'image_url';
  text?: string;
  image_url?: { url: string };
}

interface OpenRouterResponse {
  choices?: {
    message?: {
      role?: string;
      content?: string | ContentBlock[];
      text?: string;
      images?: OpenRouterImageEntry[];
    };
  }[];
  error?: { message: string; code?: number };
}

function getApiKey(): string {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key || key === 'your_openrouter_api_key_here') {
    throw new Error('OPENROUTER_API_KEY is not configured. Please set it in .env.local');
  }
  return key;
}

function getHeaders() {
  return {
    Authorization: `Bearer ${getApiKey()}`,
    'Content-Type': 'application/json',
    'HTTP-Referer': 'http://localhost:3000',
    'X-Title': 'Clothing Pipeline',
  };
}

export function fileToBase64(filePath: string): string {
  const absolutePath = path.resolve(filePath);
  const buffer = fs.readFileSync(absolutePath);
  const ext = path.extname(filePath).toLowerCase();
  const mimeMap: Record<string, string> = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
  };
  const mime = mimeMap[ext] || 'image/png';
  return `data:${mime};base64,${buffer.toString('base64')}`;
}

export function base64ToBuffer(dataUri: string): Buffer {
  const base64 = dataUri.replace(/^data:image\/\w+;base64,/, '');
  return Buffer.from(base64, 'base64');
}

/**
 * Ensure base64 image has proper data URI prefix
 */
function ensureDataUri(base64OrUri: string): string {
  if (base64OrUri.startsWith('data:image/')) {
    return base64OrUri;
  }
  // Default to PNG if no prefix
  return `data:image/png;base64,${base64OrUri}`;
}

/**
 * Validate and log image info for debugging
 */
function validateImage(base64: string, label: string): boolean {
  const isDataUri = base64.startsWith('data:image/');
  const length = base64.length;
  console.log(`[validateImage] ${label}: isDataUri=${isDataUri}, length=${length}`);
  
  if (length < 100) {
    console.warn(`[validateImage] ${label}: Image seems too small!`);
    return false;
  }
  return true;
}

function extractImagesFromResponse(data: OpenRouterResponse): string[] {
  if (data.error) {
    throw new Error(`OpenRouter error: ${data.error.message}`);
  }

  const message = data.choices?.[0]?.message;
  if (!message) {
    console.log('[extractImages] No message in response:', JSON.stringify(data).substring(0, 500));
    throw new Error('No message in OpenRouter response');
  }

  const images: string[] = [];

  // Method 1: Check message.images array (some models)
  if (message.images && Array.isArray(message.images) && message.images.length > 0) {
    for (const img of message.images) {
      if (img.image_url?.url) {
        images.push(img.image_url.url);
      }
    }
  }

  // Method 2: Check content array for image_url blocks (Gemini format)
  if (Array.isArray(message.content)) {
    for (const block of message.content) {
      // Check for image_url type
      if (block.type === 'image_url' && block.image_url?.url) {
        images.push(block.image_url.url);
      }
      // Check for inline_data (some Gemini responses)
      if ((block as any).type === 'image' && (block as any).source?.data) {
        const mimeType = (block as any).source?.media_type || 'image/png';
        images.push(`data:${mimeType};base64,${(block as any).source.data}`);
      }
      // Check for base64 directly in the block
      if ((block as any).b64_json) {
        images.push(`data:image/png;base64,${(block as any).b64_json}`);
      }
    }
  }

  // Method 3: Check for data field at root level (some formats)
  if ((data as any).data && Array.isArray((data as any).data)) {
    for (const item of (data as any).data) {
      if (item.b64_json) {
        images.push(`data:image/png;base64,${item.b64_json}`);
      }
      if (item.url) {
        images.push(item.url);
      }
    }
  }

  console.log(`[extractImages] Found ${images.length} images from response`);
  if (images.length === 0) {
    console.log('[extractImages] Full response:', JSON.stringify(data).substring(0, 1000));
  }

  return images;
}

function extractTextFromResponse(data: OpenRouterResponse): string {
  if (data.error) {
    throw new Error(`OpenRouter error: ${data.error.message}`);
  }

  const message = data.choices?.[0]?.message;
  if (!message) {
    console.log('[extractText] No message in response:', JSON.stringify(data).substring(0, 500));
    return '';
  }

  // Handle string content
  if (typeof message.content === 'string') {
    return message.content;
  }

  // Handle array content (multimodal response)
  if (Array.isArray(message.content)) {
    const textParts: string[] = [];
    for (const part of message.content) {
      if (part.type === 'text' && part.text) {
        textParts.push(part.text);
      }
    }
    return textParts.join('\n');
  }

  // Try to extract from other possible locations
  if ((message as any).text) {
    return (message as any).text;
  }

  console.log('[extractText] Could not extract text from message:', JSON.stringify(message).substring(0, 500));
  return '';
}

/**
 * Step 1: Generate image from text prompt
 */
export async function generateImageFromPrompt(
  prompt: string,
  model: string = 'google/gemini-2.5-flash-image'
): Promise<string> {
  console.log(`[Step 1] Generating image with model: ${model}`);
  console.log(`[Step 1] Prompt: ${prompt.substring(0, 100)}...`);

  const response = await fetch(OPENROUTER_API_URL, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({
      model,
      messages: [
        {
          role: 'user',
          content: `Generate an image: ${prompt}`,
        },
      ],
      modalities: ['image', 'text'],
      max_tokens: 4096,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[Step 1] API error (${response.status}):`, errorText);
    throw new Error(`OpenRouter API failed (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  console.log(`[Step 1] Raw response keys:`, Object.keys(data));
  console.log(`[Step 1] Response preview:`, JSON.stringify(data).substring(0, 800));

  // Try to extract images using the helper function
  try {
    const images = extractImagesFromResponse(data as OpenRouterResponse);
    if (images.length > 0) {
      console.log(`[Step 1] Got ${images.length} image(s) via extractImagesFromResponse`);
      return images[0];
    }
  } catch (err) {
    console.log(`[Step 1] extractImagesFromResponse error:`, err);
  }

  // Fallback: Try to find image URL in text response
  const textContent = extractTextFromResponse(data as OpenRouterResponse);
  if (textContent) {
    // Look for image URLs
    const urlMatch = textContent.match(/https?:\/\/[^\s"'<>]+\.(png|jpg|jpeg|webp|gif)/i);
    if (urlMatch) {
      console.log(`[Step 1] Found image URL in text:`, urlMatch[0]);
      try {
        const imgResponse = await fetch(urlMatch[0]);
        const imgBuffer = Buffer.from(await imgResponse.arrayBuffer());
        return `data:image/png;base64,${imgBuffer.toString('base64')}`;
      } catch (fetchErr) {
        console.error(`[Step 1] Failed to fetch image URL:`, fetchErr);
      }
    }

    // Look for base64 in text (some models return base64 directly)
    const base64Match = textContent.match(/data:image\/[^;]+;base64,[A-Za-z0-9+/=]+/);
    if (base64Match) {
      console.log(`[Step 1] Found base64 image in text`);
      return base64Match[0];
    }
  }

  // Final fallback: check for any base64 pattern in the entire response
  const responseStr = JSON.stringify(data);
  const b64Pattern = /"(data:image\/[^"]+)"/;
  const b64Match = responseStr.match(b64Pattern);
  if (b64Match && b64Match[1]) {
    console.log(`[Step 1] Found base64 in response JSON`);
    return b64Match[1];
  }

  // Check for raw base64 without data URI prefix
  const rawB64Pattern = /"b64_json"\s*:\s*"([A-Za-z0-9+/=]+)"/;
  const rawB64Match = responseStr.match(rawB64Pattern);
  if (rawB64Match && rawB64Match[1]) {
    console.log(`[Step 1] Found raw b64_json in response`);
    return `data:image/png;base64,${rawB64Match[1]}`;
  }

  throw new Error(
    'No image generated. Check the logs for API response format. Model: ' + model
  );
}

/**
 * Step 2: Combine generated image with multiple reference images
 * Images are sent in order: [generated, ref1, ref2, ref3, ...]
 */
export async function combineWithReferences(
  generatedImageBase64: string,
  referenceImagesBase64: string[],
  prompt: string,
  visionModel: string = 'google/gemini-2.5-flash',
  imageGenModel?: string
): Promise<string> {
  console.log(`[Step 2] Combining with ${referenceImagesBase64.length} reference image(s)`);
  console.log(`[Step 2] Vision model: ${visionModel}`);

  // Validate images
  validateImage(generatedImageBase64, 'generated');
  referenceImagesBase64.forEach((img, i) => validateImage(img, `reference_${i}`));

  // Ensure all images have proper data URI prefix
  const genImage = ensureDataUri(generatedImageBase64);
  const refImages = referenceImagesBase64.map(ensureDataUri);

  // Build content array with all images in order
  const contentArray: any[] = [
    {
      type: 'text',
      text:
        prompt ||
        'Analyze all the images. The first image is a generated clothing design. The remaining images are reference/mannequin images (in order of importance). ' +
        'Place the clothing design onto the figure shown in the reference images. ' +
        'Create a detailed, photorealistic composition showing the outfit being worn naturally. ' +
        'Write ONLY a detailed image generation prompt, nothing else.',
    },
    // Generated image first
    {
      type: 'image_url',
      image_url: { url: genImage },
    },
    // Reference images in order
    ...refImages.map((img) => ({
      type: 'image_url',
      image_url: { url: img },
    })),
  ];

  const analysisResponse = await fetch(OPENROUTER_API_URL, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({
      model: visionModel,
      messages: [
        {
          role: 'user',
          content: contentArray,
        },
      ],
      max_tokens: 2048,
    }),
  });

  if (!analysisResponse.ok) {
    const errorText = await analysisResponse.text();
    throw new Error(`Vision analysis failed (${analysisResponse.status}): ${errorText}`);
  }

  const analysisData: OpenRouterResponse = await analysisResponse.json();
  console.log('[Step 2] Raw response:', JSON.stringify(analysisData).substring(0, 1000));
  
  let combinedPrompt = extractTextFromResponse(analysisData);

  // If no text, try to use a fallback prompt based on the original prompt
  if (!combinedPrompt) {
    console.warn('[Step 2] Vision model returned empty analysis, using fallback');
    combinedPrompt = prompt || 
      'A person wearing the clothing outfit from the first image, photorealistic, professional fashion photography, ' +
      'showing the complete outfit naturally worn, studio lighting, high quality';
  }

  console.log(`[Step 2] Got analysis (${combinedPrompt.length} chars), generating combined image...`);

  // Generate combined image
  const genModel = imageGenModel || 'google/gemini-2.5-flash-image';

  // Include the first reference image for context
  const genContentArray: any[] = [
    {
      type: 'text',
      text: `Generate this image: ${combinedPrompt}`,
    },
  ];

  // Add first reference image for context if available
  if (refImages.length > 0) {
    genContentArray.push({
      type: 'image_url',
      image_url: { url: refImages[0] },
    });
  }

  const genResponse = await fetch(OPENROUTER_API_URL, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({
      model: genModel,
      messages: [
        {
          role: 'user',
          content: genContentArray,
        },
      ],
      modalities: ['image', 'text'],
      max_tokens: 4096,
    }),
  });

  if (!genResponse.ok) {
    const errorText = await genResponse.text();
    throw new Error(`Combined image generation failed (${genResponse.status}): ${errorText}`);
  }

  const genData: OpenRouterResponse = await genResponse.json();
  const images = extractImagesFromResponse(genData);

  if (images.length === 0) {
    throw new Error('No combined image generated');
  }

  console.log('[Step 2] Combined image generated successfully');
  return images[0];
}

/**
 * Step 3: Separate clothing using multiple reference images (bone/skeleton)
 * Images are sent in order: [clothing, ref1, ref2, ref3, ...]
 */
export async function separateClothingWithReferences(
  clothingImageBase64: string,
  referenceImagesBase64: string[],
  prompt: string,
  visionModel: string = 'google/gemini-2.5-flash',
  imageGenModel?: string
): Promise<{ analysis: string; images: string[] }> {
  console.log(`[Step 3] Separating with ${referenceImagesBase64.length} reference image(s)`);
  console.log(`[Step 3] Vision model: ${visionModel}`);

  // Validate images
  validateImage(clothingImageBase64, 'clothing');
  referenceImagesBase64.forEach((img, i) => validateImage(img, `bone_ref_${i}`));

  // Ensure all images have proper data URI prefix
  const clothingImage = ensureDataUri(clothingImageBase64);
  const refImages = referenceImagesBase64.map(ensureDataUri);

  // Build content array with all images in order
  const contentArray: any[] = [
    {
      type: 'text',
      text:
        prompt ||
        'Analyze all the images. The first image is the clothing outfit. The remaining images are reference images (may include bone/skeleton structure) in order of importance. ' +
        'Identify each distinct clothing piece (top, bottom, shoes, accessories, etc.) based on the body segments shown in the reference images. ' +
        'For each piece, provide a detailed generation prompt to recreate just that piece isolated on a clean white background.\n\n' +
        'IMPORTANT: Respond ONLY with a valid JSON array, no markdown. Format:\n' +
        '[{"name": "piece_name", "description": "brief description", "prompt": "detailed prompt for generating this piece isolated on white background"}]',
    },
    // Clothing image first
    {
      type: 'image_url',
      image_url: { url: clothingImage },
    },
    // Reference images in order
    ...refImages.map((img) => ({
      type: 'image_url',
      image_url: { url: img },
    })),
  ];

  const analysisResponse = await fetch(OPENROUTER_API_URL, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({
      model: visionModel,
      messages: [
        {
          role: 'user',
          content: contentArray,
        },
      ],
      max_tokens: 4096,
    }),
  });

  if (!analysisResponse.ok) {
    const errorText = await analysisResponse.text();
    throw new Error(`Clothing analysis failed (${analysisResponse.status}): ${errorText}`);
  }

  const analysisData: OpenRouterResponse = await analysisResponse.json();
  console.log('[Step 3] Raw response:', JSON.stringify(analysisData).substring(0, 1000));
  
  let analysisText = extractTextFromResponse(analysisData);

  // If no text, use a fallback
  if (!analysisText) {
    console.warn('[Step 3] Vision model returned empty analysis, using fallback');
    analysisText = JSON.stringify([
      {
        name: 'top',
        description: 'Upper body clothing piece',
        prompt: 'Isolated top/shirt clothing piece on clean white background, product photography, no mannequin, high quality'
      },
      {
        name: 'bottom',
        description: 'Lower body clothing piece',
        prompt: 'Isolated pants/skirt clothing piece on clean white background, product photography, no mannequin, high quality'
      }
    ]);
  }

  console.log(`[Step 3] Got analysis (${analysisText.length} chars), parsing...`);

  // Parse JSON response
  let clothingPieces: { name: string; description: string; prompt: string }[] = [];

  try {
    let jsonStr = analysisText;
    const codeBlockMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch) {
      jsonStr = codeBlockMatch[1].trim();
    }

    const jsonArrayMatch = jsonStr.match(/\[[\s\S]*\]/);
    if (jsonArrayMatch) {
      clothingPieces = JSON.parse(jsonArrayMatch[0]);
    } else {
      throw new Error('No JSON array found');
    }
  } catch (parseErr) {
    console.warn('[Step 3] JSON parsing failed, creating single entry:', parseErr);
    clothingPieces = [
      {
        name: 'full_outfit',
        description: analysisText.substring(0, 200),
        prompt: `Isolated clothing outfit on white background, product photography: ${analysisText.substring(0, 500)}`,
      },
    ];
  }

  console.log(`[Step 3] Found ${clothingPieces.length} piece(s), generating images...`);

  // Generate individual piece images
  const genModel = imageGenModel || 'google/gemini-2.5-flash-image';
  const generatedImages: string[] = [];

  for (let i = 0; i < clothingPieces.length; i++) {
    const piece = clothingPieces[i];
    console.log(`[Step 3] Generating piece ${i + 1}/${clothingPieces.length}: ${piece.name}`);

    try {
      const pieceResponse = await fetch(OPENROUTER_API_URL, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({
          model: genModel,
          messages: [
            {
              role: 'user',
              content: `Generate an image: ${piece.prompt}. The item must be isolated on a clean white background, product photography style, no mannequin or person, just the clothing piece by itself.`,
            },
          ],
          modalities: ['image', 'text'],
          max_tokens: 4096,
        }),
      });

      if (!pieceResponse.ok) {
        const errText = await pieceResponse.text();
        console.error(`[Step 3] Failed to generate ${piece.name}: ${errText}`);
        continue;
      }

      const pieceData: OpenRouterResponse = await pieceResponse.json();
      const pieceImages = extractImagesFromResponse(pieceData);

      if (pieceImages.length > 0) {
        generatedImages.push(pieceImages[0]);
        console.log(`[Step 3] ✓ Generated ${piece.name}`);
      } else {
        console.warn(`[Step 3] ✗ No image for ${piece.name}`);
      }
    } catch (err: any) {
      console.error(`[Step 3] Error generating ${piece.name}:`, err.message);
    }
  }

  return {
    analysis: analysisText,
    images: generatedImages,
  };
}

// Legacy exports for backward compatibility
export const combineWithReference = combineWithReferences;
export const separateClothing = separateClothingWithReferences;

/**
 * Step 2.5: Extract clothing silhouette (black background + white clothing OR blue screen)
 */
export async function extractSilhouette(
  clothingImageBase64: string,
  mode: 'blackwhite' | 'bluescreen' = 'blackwhite',
  customPrompt: string = '',
  visionModel: string = 'google/gemini-2.5-flash',
  imageGenModel?: string
): Promise<string> {
  console.log(`[Step 2.5] Extracting silhouette, mode: ${mode}`);
  console.log(`[Step 2.5] Vision model: ${visionModel}`);

  // Validate and ensure proper format
  validateImage(clothingImageBase64, 'clothing_for_silhouette');
  const clothingImage = ensureDataUri(clothingImageBase64);

  const bgColor = mode === 'bluescreen' ? 'bright blue (chroma key blue, #0000FF)' : 'pure black (#000000)';
  const fgColor = mode === 'bluescreen' ? 'original colors' : 'pure white (#FFFFFF)';

  // Use custom prompt if provided, otherwise use default
  const analysisPromptText = customPrompt || 
    `Analyze this image and identify all clothing items worn by the person/mannequin. 
Describe each clothing piece in detail (shape, style, position).
Then write a detailed image generation prompt to recreate ONLY the clothing items as a silhouette:
- Background: ${bgColor}
- Clothing: ${fgColor}
- No person or mannequin visible, just the clothing shapes
- Maintain exact proportions and positions
- Clean edges, no gradients

Write ONLY the generation prompt, nothing else.`;

  // First, analyze the clothing to understand what to extract
  const analysisResponse = await fetch(OPENROUTER_API_URL, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({
      model: visionModel,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: analysisPromptText,
            },
            {
              type: 'image_url',
              image_url: { url: clothingImage },
            },
          ],
        },
      ],
      max_tokens: 2048,
    }),
  });

  if (!analysisResponse.ok) {
    const errorText = await analysisResponse.text();
    throw new Error(`Silhouette analysis failed (${analysisResponse.status}): ${errorText}`);
  }

  const analysisData: OpenRouterResponse = await analysisResponse.json();
  console.log('[Step 2.5] Analysis response:', JSON.stringify(analysisData).substring(0, 500));
  
  let silhouettePrompt = extractTextFromResponse(analysisData);

  if (!silhouettePrompt) {
    console.warn('[Step 2.5] Empty analysis, using fallback');
    silhouettePrompt = mode === 'bluescreen'
      ? 'Clothing items isolated on bright blue chroma key background, exact same shapes and positions as original, clean edges, no person visible'
      : 'White silhouette of clothing items on pure black background, exact same shapes and positions as original, clean edges, no person visible';
  }

  console.log(`[Step 2.5] Got prompt (${silhouettePrompt.length} chars), generating silhouette...`);

  // Generate the silhouette image
  const genModel = imageGenModel || 'google/gemini-2.5-flash-image';

  const genResponse = await fetch(OPENROUTER_API_URL, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({
      model: genModel,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `Generate this image: ${silhouettePrompt}

IMPORTANT: 
- Background must be ${bgColor}
- Clothing shapes must be ${fgColor}
- No human figure, only clothing silhouettes
- Same layout and proportions as reference`,
            },
            {
              type: 'image_url',
              image_url: { url: clothingImage },
            },
          ],
        },
      ],
      modalities: ['image', 'text'],
      max_tokens: 4096,
    }),
  });

  if (!genResponse.ok) {
    const errorText = await genResponse.text();
    throw new Error(`Silhouette generation failed (${genResponse.status}): ${errorText}`);
  }

  const genData: OpenRouterResponse = await genResponse.json();
  const images = extractImagesFromResponse(genData);

  if (images.length === 0) {
    throw new Error('No silhouette image generated');
  }

  console.log('[Step 2.5] Silhouette generated successfully');
  return images[0];
}

/**
 * Step 3 (New): Combine multiple images together
 * Combines: Step 2 result + Silhouette + User uploaded references
 */
export async function combineMultipleImages(
  images: string[],
  prompt: string,
  visionModel: string = 'google/gemini-2.5-flash',
  imageGenModel?: string
): Promise<string> {
  console.log(`[Step 3] Combining ${images.length} images`);
  console.log(`[Step 3] Vision model: ${visionModel}`);

  if (images.length === 0) {
    throw new Error('No images provided for combination');
  }

  // Validate and ensure proper format
  const validImages = images.map((img, i) => {
    validateImage(img, `combine_image_${i}`);
    return ensureDataUri(img);
  });

  // Build content array
  const contentArray: any[] = [
    {
      type: 'text',
      text: prompt || 
        `Analyze all the provided images carefully:
- Image 1: The combined clothing on mannequin/model
- Image 2: The silhouette/mask of the clothing
- Remaining images: Reference images for style, pose, or composition

Create a detailed prompt to generate a final composite image that:
1. Uses the clothing from image 1
2. Applies the silhouette structure from image 2
3. Incorporates elements from the reference images
4. Results in a professional, cohesive fashion photograph

Write ONLY the generation prompt, nothing else.`,
    },
    ...validImages.map((img) => ({
      type: 'image_url',
      image_url: { url: img },
    })),
  ];

  const analysisResponse = await fetch(OPENROUTER_API_URL, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({
      model: visionModel,
      messages: [{ role: 'user', content: contentArray }],
      max_tokens: 2048,
    }),
  });

  if (!analysisResponse.ok) {
    const errorText = await analysisResponse.text();
    throw new Error(`Multi-image analysis failed (${analysisResponse.status}): ${errorText}`);
  }

  const analysisData: OpenRouterResponse = await analysisResponse.json();
  console.log('[Step 3] Analysis response:', JSON.stringify(analysisData).substring(0, 500));
  
  let combinedPrompt = extractTextFromResponse(analysisData);

  if (!combinedPrompt) {
    console.warn('[Step 3] Empty analysis, using fallback');
    combinedPrompt = 'Professional fashion photograph combining all reference elements, high quality, studio lighting';
  }

  console.log(`[Step 3] Got prompt (${combinedPrompt.length} chars), generating combined image...`);

  // Generate combined image
  const genModel = imageGenModel || 'google/gemini-2.5-flash-image';

  // Include first image as reference
  const genResponse = await fetch(OPENROUTER_API_URL, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({
      model: genModel,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `Generate this image: ${combinedPrompt}`,
            },
            {
              type: 'image_url',
              image_url: { url: validImages[0] },
            },
          ],
        },
      ],
      modalities: ['image', 'text'],
      max_tokens: 4096,
    }),
  });

  if (!genResponse.ok) {
    const errorText = await genResponse.text();
    throw new Error(`Combined image generation failed (${genResponse.status}): ${errorText}`);
  }

  const genData: OpenRouterResponse = await genResponse.json();
  const resultImages = extractImagesFromResponse(genData);

  if (resultImages.length === 0) {
    throw new Error('No combined image generated');
  }

  console.log('[Step 3] Combined image generated successfully');
  return resultImages[0];
}

/**
 * Step 2 (v4): Extract clothing from generated image
 * Uses reference images to help with extraction
 */
export async function extractClothing(
  sourceImageBase64: string,
  referenceImagesBase64: string[],
  prompt: string,
  visionModel: string = 'google/gemini-2.5-flash',
  imageGenModel?: string
): Promise<string> {
  console.log(`[Step 2] Extracting clothing with ${referenceImagesBase64.length} reference(s)`);
  console.log(`[Step 2] Vision model: ${visionModel}`);

  // Validate source image
  validateImage(sourceImageBase64, 'source');
  const sourceImage = ensureDataUri(sourceImageBase64);

  // Build content array with all images
  const contentArray: any[] = [
    {
      type: 'text',
      text: prompt || `Analyze this image and extract the clothing items. 
Create a detailed prompt to generate ONLY the clothing items isolated on a clean white/transparent background.
The extracted clothing should:
- Be isolated without any person or mannequin
- Maintain exact colors, patterns, and details
- Be shown from the same angle as the original
- Have clean, well-defined edges

Write ONLY the generation prompt for the extracted clothing, nothing else.`,
    },
    {
      type: 'image_url',
      image_url: { url: sourceImage },
    },
  ];

  // Add reference images
  for (const refImg of referenceImagesBase64) {
    validateImage(refImg, 'reference');
    contentArray.push({
      type: 'image_url',
      image_url: { url: ensureDataUri(refImg) },
    });
  }

  const analysisResponse = await fetch(OPENROUTER_API_URL, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({
      model: visionModel,
      messages: [{ role: 'user', content: contentArray }],
      max_tokens: 2048,
    }),
  });

  if (!analysisResponse.ok) {
    const errorText = await analysisResponse.text();
    throw new Error(`Extraction analysis failed (${analysisResponse.status}): ${errorText}`);
  }

  const analysisData: OpenRouterResponse = await analysisResponse.json();
  console.log('[Step 2] Analysis response:', JSON.stringify(analysisData).substring(0, 500));

  let extractionPrompt = extractTextFromResponse(analysisData);

  if (!extractionPrompt) {
    console.warn('[Step 2] Empty analysis, using fallback');
    extractionPrompt = 'Isolated clothing items on clean white background, exact same style and colors as original, product photography, no person visible';
  }

  console.log(`[Step 2] Got prompt (${extractionPrompt.length} chars), generating extracted clothing...`);

  // Generate the extracted clothing image
  const genModel = imageGenModel || 'google/gemini-2.5-flash-image';

  const genResponse = await fetch(OPENROUTER_API_URL, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({
      model: genModel,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `Generate this image: ${extractionPrompt}

IMPORTANT: Show ONLY the clothing items isolated on a clean white background. No person, no mannequin, just the clothing pieces arranged neatly.`,
            },
            {
              type: 'image_url',
              image_url: { url: sourceImage },
            },
          ],
        },
      ],
      modalities: ['image', 'text'],
      max_tokens: 4096,
    }),
  });

  if (!genResponse.ok) {
    const errorText = await genResponse.text();
    throw new Error(`Clothing extraction failed (${genResponse.status}): ${errorText}`);
  }

  const genData: OpenRouterResponse = await genResponse.json();
  const images = extractImagesFromResponse(genData);

  if (images.length === 0) {
    throw new Error('No extracted clothing image generated');
  }

  console.log('[Step 2] Clothing extracted successfully');
  return images[0];
}

/**
 * Step 3 (v4): Create silhouette (B&W or Blue Screen)
 */
export async function createSilhouette(
  clothingImageBase64: string,
  mode: 'blackwhite' | 'bluescreen' = 'blackwhite',
  customPrompt: string = '',
  visionModel: string = 'google/gemini-2.5-flash',
  imageGenModel?: string
): Promise<string> {
  console.log(`[Step 3] Creating silhouette, mode: ${mode}`);

  validateImage(clothingImageBase64, 'clothing');
  const clothingImage = ensureDataUri(clothingImageBase64);

  const bgColor = mode === 'bluescreen' ? 'bright blue chroma key (#0000FF)' : 'pure black (#000000)';
  const fgColor = mode === 'bluescreen' ? 'original clothing colors preserved' : 'pure white (#FFFFFF)';

  const defaultPrompt = `Analyze this clothing image and create a silhouette:
- Background: ${bgColor}
- Clothing shape: ${fgColor}
- Maintain exact clothing shape and proportions
- Clean, crisp edges
- No gradients or shadows

Write ONLY a prompt to generate this silhouette image.`;

  const analysisResponse = await fetch(OPENROUTER_API_URL, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({
      model: visionModel,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: customPrompt || defaultPrompt },
            { type: 'image_url', image_url: { url: clothingImage } },
          ],
        },
      ],
      max_tokens: 2048,
    }),
  });

  if (!analysisResponse.ok) {
    const errorText = await analysisResponse.text();
    throw new Error(`Silhouette analysis failed (${analysisResponse.status}): ${errorText}`);
  }

  const analysisData: OpenRouterResponse = await analysisResponse.json();
  let silhouettePrompt = extractTextFromResponse(analysisData);

  if (!silhouettePrompt) {
    silhouettePrompt = mode === 'bluescreen'
      ? 'Clothing silhouette on bright blue chroma key background, original colors preserved, clean edges'
      : 'White clothing silhouette on pure black background, clean edges, exact shape';
  }

  console.log(`[Step 3] Generating silhouette image...`);

  const genModel = imageGenModel || 'google/gemini-2.5-flash-image';

  const genResponse = await fetch(OPENROUTER_API_URL, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({
      model: genModel,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `Generate this silhouette image: ${silhouettePrompt}

CRITICAL REQUIREMENTS:
- Background MUST be ${bgColor}
- Clothing MUST be ${fgColor}
- Exact same shape as the reference clothing
- No person or mannequin, just the clothing shape`,
            },
            { type: 'image_url', image_url: { url: clothingImage } },
          ],
        },
      ],
      modalities: ['image', 'text'],
      max_tokens: 4096,
    }),
  });

  if (!genResponse.ok) {
    const errorText = await genResponse.text();
    throw new Error(`Silhouette generation failed (${genResponse.status}): ${errorText}`);
  }

  const genData: OpenRouterResponse = await genResponse.json();
  const images = extractImagesFromResponse(genData);

  if (images.length === 0) {
    throw new Error('No silhouette image generated');
  }

  console.log('[Step 3] Silhouette created successfully');
  return images[0];
}

/**
 * Step 2 (v5): Dress mannequin with clothing from Step 1
 * Clothing image is ALWAYS first, followed by mannequin reference images
 */
export async function dressManneqin(
  clothingImageBase64: string,
  mannequinImagesBase64: string[],
  prompt: string,
  visionModel: string = 'google/gemini-2.5-flash',
  imageGenModel?: string
): Promise<string> {
  console.log(`[Step 2] Dressing mannequin with ${mannequinImagesBase64.length} reference(s)`);

  validateImage(clothingImageBase64, 'clothing');
  const clothingImage = ensureDataUri(clothingImageBase64);

  const genModel = imageGenModel || 'google/gemini-2.5-flash-image';

  // Build content array with clear instructions
  const genContent: any[] = [
    {
      type: 'text',
      text: `${prompt}

TASK: Put the clothing from IMAGE 1 onto the mannequin/model from IMAGE 2.

IMAGE 1 (first image): The CLOTHING item to use
IMAGE 2+ (following images): The MANNEQUIN/MODEL - use this EXACT body pose and position

REQUIREMENTS:
1. Take the clothing from IMAGE 1
2. Put it on the mannequin body from IMAGE 2
3. Use the EXACT same pose, angle, and body position as IMAGE 2
4. The clothing must FIT PERFECTLY on the mannequin body
5. Keep the original clothing colors and details
6. Professional fashion photography style
7. Clean white/light background

Generate the mannequin wearing the clothing now.`,
    },
    { type: 'image_url', image_url: { url: clothingImage } },
  ];
  
  // Add ALL mannequin reference images
  for (const mannequinImg of mannequinImagesBase64) {
    validateImage(mannequinImg, 'mannequin');
    genContent.push({ 
      type: 'image_url', 
      image_url: { url: ensureDataUri(mannequinImg) } 
    });
  }

  console.log(`[Step 2] Sending ${mannequinImagesBase64.length} mannequin images to ${genModel}`);

  const genResponse = await fetch(OPENROUTER_API_URL, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({
      model: genModel,
      messages: [{ role: 'user', content: genContent }],
      modalities: ['image', 'text'],
      max_tokens: 4096,
    }),
  });

  if (!genResponse.ok) {
    const errorText = await genResponse.text();
    throw new Error(`Dressing generation failed (${genResponse.status}): ${errorText}`);
  }

  const genData: OpenRouterResponse = await genResponse.json();
  const images = extractImagesFromResponse(genData);

  if (images.length === 0) {
    throw new Error('No dressed mannequin image generated');
  }

  console.log('[Step 2] Mannequin dressed successfully');
  return images[0];
}

/**
 * Step 3 (v5): Extract clothing from dressed mannequin using MASK approach
 * 1. Generate a binary mask (white clothing ONLY, black everything else)
 * 2. Apply mask to Step 2 image to cut out the actual clothing
 * This ensures the extracted clothing is IDENTICAL to Step 2
 */
export async function extractClothingFromDressed(
  dressedImageBase64: string,
  prompt: string,
  visionModel: string = 'google/gemini-2.5-flash',
  imageGenModel?: string
): Promise<{ extracted: string; mask: string }> {
  console.log(`[Step 3] Extracting clothing using mask approach`);

  validateImage(dressedImageBase64, 'dressed');
  const dressedImage = ensureDataUri(dressedImageBase64);

  // Step 3a: Generate a binary MASK of the clothing ONLY
  const maskResponse = await fetch(OPENROUTER_API_URL, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({
      model: imageGenModel || 'google/gemini-2.5-flash-image',
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `${prompt}

Create a precise BINARY SEGMENTATION MASK for ONLY the clothing/garments:

MUST BE WHITE (#FFFFFF):
- Shirts, t-shirts, blouses, tops
- Pants, trousers, skirts, shorts
- Dresses, jackets, coats
- Belts, accessories on the clothing

MUST BE BLACK (#000000):
- ALL skin (hands, arms, neck, face, legs, feet)
- Hair
- Background
- Shoes/footwear
- Any body parts visible

CRITICAL RULES:
- This is for clothing extraction - NO SKIN should be white
- Even if hands are inside pockets, the hands should be BLACK
- Arms sticking out of sleeves should be BLACK
- Only the FABRIC of clothing should be WHITE
- Output a clean black and white mask image`,
            },
            { type: 'image_url', image_url: { url: dressedImage } },
          ],
        },
      ],
      modalities: ['image', 'text'],
      max_tokens: 4096,
    }),
  });

  if (!maskResponse.ok) {
    const errorText = await maskResponse.text();
    throw new Error(`Mask generation failed (${maskResponse.status}): ${errorText}`);
  }

  const maskData: OpenRouterResponse = await maskResponse.json();
  const maskImages = extractImagesFromResponse(maskData);

  if (maskImages.length === 0) {
    throw new Error('No mask image generated');
  }

  const maskImage = maskImages[0];
  console.log('[Step 3] Mask generated successfully');

  // Return both the mask and indicate we need to apply it
  return {
    extracted: dressedImageBase64, // Will be processed with mask
    mask: maskImage,
  };
}

/**
 * Step 4 (v6): Extract clothing with reference images
 * Uses reference images to help create better mask
 */
export async function extractClothingWithReference(
  dressedImageBase64: string,
  referenceImagesBase64: string[],
  prompt: string,
  visionModel: string = 'google/gemini-2.5-flash',
  imageGenModel?: string
): Promise<{ extracted: string; mask: string }> {
  console.log(`[Step 4] Extracting clothing with ${referenceImagesBase64.length} references`);

  validateImage(dressedImageBase64, 'dressed');
  const dressedImage = ensureDataUri(dressedImageBase64);

  // Build content with reference images
  const contentArray: any[] = [
    {
      type: 'text',
      text: `${prompt}

Create a precise BINARY SEGMENTATION MASK for ONLY the clothing/garments:

The FIRST image is the dressed mannequin - extract clothing from this.
Additional images are REFERENCES showing how extracted clothing should look.

MUST BE WHITE (#FFFFFF):
- All clothing fabric (shirts, pants, dresses, etc.)
- Belts, accessories on the clothing

MUST BE BLACK (#000000):
- ALL skin (hands, arms, neck, face, legs, feet) - NO EXCEPTIONS
- Hair
- Background
- Shoes
- Any body parts

CRITICAL: Only FABRIC should be white. NO SKIN at all.
Output a clean black and white mask image.`,
    },
    { type: 'image_url', image_url: { url: dressedImage } },
  ];

  // Add reference images
  for (const refImg of referenceImagesBase64) {
    try {
      validateImage(refImg, 'reference');
      contentArray.push({
        type: 'image_url',
        image_url: { url: ensureDataUri(refImg) },
      });
    } catch {}
  }

  const maskResponse = await fetch(OPENROUTER_API_URL, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({
      model: imageGenModel || 'google/gemini-2.5-flash-image',
      messages: [{ role: 'user', content: contentArray }],
      modalities: ['image', 'text'],
      max_tokens: 4096,
    }),
  });

  if (!maskResponse.ok) {
    const errorText = await maskResponse.text();
    throw new Error(`Mask generation failed (${maskResponse.status}): ${errorText}`);
  }

  const maskData: OpenRouterResponse = await maskResponse.json();
  const maskImages = extractImagesFromResponse(maskData);

  if (maskImages.length === 0) {
    throw new Error('No mask image generated');
  }

  console.log('[Step 4] Mask generated successfully');
  return {
    extracted: dressedImageBase64,
    mask: maskImages[0],
  };
}

/**
 * Generate clothing image on transparent background for Step 3
 * Instead of creating a mask, directly generate the extracted clothing
 */
export async function generateSegmentationMask(
  dressedImageBase64: string,
  referenceImagesBase64: string[],
  clothingDescription: string,
  visionModel: string = 'google/gemini-2.5-flash',
  imageGenModel?: string
): Promise<string> {
  console.log(`[Step 3] Extracting clothing: ${clothingDescription}`);
  console.log(`[Step 3] Reference images: ${referenceImagesBase64.length}`);

  validateImage(dressedImageBase64, 'dressed');
  const dressedImage = ensureDataUri(dressedImageBase64);

  // Direct extraction prompt - ask AI to generate clothing on transparent background
  const extractPrompt = `Look at the image of a mannequin/model wearing a ${clothingDescription}.

YOUR TASK: Generate ONLY the clothing item (${clothingDescription}) on a transparent background.

REQUIREMENTS:
1. Extract ONLY the ${clothingDescription} from the image
2. Remove the mannequin/body completely - no arms, no legs, no skin
3. The background must be TRANSPARENT (PNG with alpha)
4. Keep the exact colors, patterns, and details of the clothing
5. The clothing should appear as if floating - no body inside

OUTPUT: A PNG image of just the ${clothingDescription} with transparent background, no mannequin visible.`;

  const contentArray: any[] = [
    { type: 'text', text: extractPrompt },
    { type: 'image_url', image_url: { url: dressedImage } },
  ];

  // Add reference images if available
  for (const refImg of referenceImagesBase64) {
    try {
      validateImage(refImg, 'reference');
      contentArray.push({
        type: 'image_url',
        image_url: { url: ensureDataUri(refImg) },
      });
    } catch {}
  }

  console.log(`[Step 3] Sending request to ${imageGenModel || 'google/gemini-2.5-flash-image'}`);

  const response = await fetch(OPENROUTER_API_URL, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({
      model: imageGenModel || 'google/gemini-2.5-flash-image',
      messages: [{ role: 'user', content: contentArray }],
      modalities: ['image', 'text'],
      max_tokens: 4096,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[Step 3] API Error: ${errorText}`);
    throw new Error(`Clothing extraction failed (${response.status}): ${errorText}`);
  }

  const data: OpenRouterResponse = await response.json();
  const images = extractImagesFromResponse(data);

  if (images.length === 0) {
    console.error('[Step 3] No image in response');
    throw new Error('No clothing image generated');
  }

  console.log('[Step 3] Clothing extracted successfully');
  return images[0];
}
