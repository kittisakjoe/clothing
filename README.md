# Clothing Pipeline 👗

Automated AI clothing generation & extraction pipeline built with Next.js. Upload an Excel file containing design prompts and let the system automatically generate, combine, and separate clothing pieces through a 3-step AI pipeline.

## Architecture

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   Step 1     │     │   Step 2     │     │   Step 3     │
│  Generate    │────▶│  Combine     │────▶│  Separate    │
│  from Prompt │     │  w/ Reference│     │  w/ Bone Ref │
└──────────────┘     └──────────────┘     └──────────────┘
       │                    │                    │
  XLSX Prompt         + Reference Img      + Bone Image
       │                    │                    │
  OpenRouter API      OpenRouter API       OpenRouter API
  (Image Gen)         (Vision + Gen)       (Vision + Gen)
       │                    │                    │
       ▼                    ▼                    ▼
  Generated Image     Combined Image      Separated Pieces
```

## Pipeline Steps

### Step 1 — Generate from Prompt
- Reads prompts from Excel file (user-specified sheet & column)
- Calls OpenRouter API with an image generation model (e.g., DALL-E 3)
- Saves generated image

### Step 2 — Combine with Reference
- Takes Step 1 output + uploaded reference image (mannequin/model)
- Uses vision model to analyze both images
- Generates a combined composition
- Saves combined image

### Step 3 — Separate Clothing Pieces
- Takes Step 2 output + uploaded bone/skeleton reference image
- Vision model identifies individual clothing pieces based on body segments
- Generates isolated images for each piece on white background
- Saves all separated pieces

## Getting Started

### Prerequisites
- Node.js 18+
- OpenRouter API key ([get one here](https://openrouter.ai/keys))

### Installation

```bash
cd clothing
npm install
```

### Configuration

Edit `.env.local`:

```env
OPENROUTER_API_KEY=sk-or-xxxxxxxxxxxxx

# Models (customize based on your needs)
OPENROUTER_IMAGE_GEN_MODEL=openai/dall-e-3
OPENROUTER_VISION_MODEL=openai/gpt-4o
OPENROUTER_IMAGE_EDIT_MODEL=openai/dall-e-3
```

### Run

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

## Usage

1. **Upload Excel File** — `.xlsx` file with design prompts in a column
2. **Select Sheet & Columns** — Choose which sheet, prompt column, and optional name column
3. **Upload Reference Image** — Mannequin or model photo for Step 2
4. **Upload Bone Reference** — Skeleton/bone structure image for Step 3
5. **Click "Start Pipeline"** — Sit back and watch the automated process

### Excel File Format

| Name | Prompt | Category |
|------|--------|----------|
| Summer Dress | A flowing summer dress with floral patterns... | Dress |
| Winter Coat | A warm wool coat with fur collar... | Outerwear |

## Output

All generated images are saved to `public/output/`:

```
public/output/
├── Summer_Dress/
│   ├── Summer_Dress_step1.png    # Generated design
│   ├── Summer_Dress_step2.png    # Combined with mannequin
│   ├── Summer_Dress_step3_piece_1.png  # Separated top
│   └── Summer_Dress_step3_piece_2.png  # Separated bottom
└── Winter_Coat/
    └── ...
```

## Supported OpenRouter Models

### Image Generation (Step 1)
- `openai/dall-e-3` (recommended)
- `stabilityai/stable-diffusion-xl`
- Any model supporting `/images/generations`

### Vision + Analysis (Steps 2 & 3)
- `openai/gpt-4o` (recommended)
- `anthropic/claude-sonnet-4-20250514`
- `google/gemini-pro-vision`
- Any model supporting vision input

## Tech Stack

- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **Excel Parsing**: SheetJS (xlsx)
- **AI API**: OpenRouter
- **Streaming**: Server-Sent Events (SSE)

## Project Structure

```
src/
├── app/
│   ├── api/
│   │   ├── process/route.ts    # Main pipeline SSE endpoint
│   │   ├── upload/route.ts     # File upload handler
│   │   └── sheets/route.ts     # Excel sheet reader
│   ├── globals.css
│   ├── layout.tsx
│   └── page.tsx                # Main UI
├── components/
│   ├── FileUploadZone.tsx      # Drag & drop upload
│   ├── StepIndicator.tsx       # Pipeline step progress
│   ├── LogPanel.tsx            # Real-time log viewer
│   └── ResultGallery.tsx       # Image result display
├── lib/
│   ├── excel-reader.ts         # Excel parsing utilities
│   ├── openrouter.ts           # OpenRouter API client
│   └── image-utils.ts          # Image save/load helpers
└── types/
    └── index.ts                # TypeScript definitions
```
