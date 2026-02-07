# Clothing Pipeline v8

## What's New in v8

### Problem Solved
- **เสื้อไม่ตรงกับ Step 1** → Step 4 เปลี่ยนเป็น code-based mask application
- **Mask ไม่แม่นยำ** → Grayscale mask support + edge feathering
- **Final ไม่ transparent จริง** → removeWhiteBackground() post-processing
- **AI สร้างเสื้อใหม่** → Step 2 ใช้แค่ 1 mannequin ref (ลดจาก 3)

### Pipeline Flow
```
Step 1: Generate → AI (nano-banana-pro) text→image
Step 2: Dress   → AI (nano-banana-pro) put clothing on mannequin
Step 3: Mask    → AI (nano-banana-pro) create B&W segmentation mask
Step 4: Extract → CODE (applyMask + removeBackground) true transparent PNG
Step 5: Save    → Auto save to folder/filename from Excel
```

### Step 4 Modes
- **Code-Based (Default)**: applyMaskToImage + removeWhiteBackground — clothing consistent
- **AI-Based (Legacy)**: nano-banana-pro — clothing may change

## Setup
```bash
npm install
cp .env.example .env.local  # Add REPLICATE_API_TOKEN
npm run dev
```

## Files Changed (v7 → v8)
- src/app/api/process/route.ts — Step 4 code-based + removeWhiteBackground
- src/lib/replicate.ts — Step 2 single mannequin ref
- src/lib/image-utils.ts — Improved mask with grayscale + feathering
- src/app/page.tsx — Step 4 mode toggle
- src/components/ResultGallery.tsx — Updated labels
- PROMPTS_v8.md — Recommended Excel prompts
