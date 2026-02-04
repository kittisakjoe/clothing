# Clothing Pipeline 👗

AI-powered clothing generation & extraction pipeline built with Next.js and OpenRouter.

## 🚀 Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Setup Environment Variables

**⚠️ IMPORTANT: Never commit API keys to Git!**

```bash
# Copy the example file
cp .env.example .env.local

# Edit .env.local and add your API key
nano .env.local
```

```env
OPENROUTER_API_KEY=sk-or-v1-your-actual-key-here
```

### 3. Run Development Server
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

---

## 🔐 Security Best Practices

| File | Purpose | Git Status |
|------|---------|------------|
| `.env.example` | Template (no real keys) | ✅ Safe to commit |
| `.env.local` | Your actual keys | ❌ **NEVER commit** |

### For Vercel Deployment

1. Go to Vercel Dashboard → Your Project → Settings → Environment Variables
2. Add: `OPENROUTER_API_KEY` = `sk-or-v1-xxx...`
3. Deploy/Redeploy

### If You Accidentally Committed a Key

1. **Revoke the key immediately** at [OpenRouter Keys](https://openrouter.ai/keys)
2. Generate a new key
3. Remove from Git history:
```bash
git filter-branch --force --index-filter \
  "git rm --cached --ignore-unmatch .env.local" \
  --prune-empty --tag-name-filter cat -- --all
git push origin --force --all
```

---

## 📋 Pipeline Flow

```
Step 1: Generate    → รูปเสื้อผ้าจาก Prompt
Step 2: Dress       → สวมเสื้อบนหุ่น
Step 3: Extract     → ถอดเสื้อออกจากหุ่น (transparent BG)
Step 4: Final       → ผลลัพธ์สุดท้าย
Step 5: Save        → บันทึกไฟล์อัตโนมัติ
```

## 🛠️ Tech Stack

- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **Excel**: SheetJS (xlsx)
- **AI**: OpenRouter (Gemini Flash)
- **Streaming**: Server-Sent Events

## 📁 Project Structure

```
src/
├── app/
│   ├── api/
│   │   ├── process/route.ts   # Main pipeline
│   │   ├── upload/route.ts    # File upload
│   │   └── sheets/route.ts    # Excel reader
│   └── page.tsx               # Main UI
├── components/
│   ├── FileUploadZone.tsx
│   ├── DraggableImageList.tsx
│   ├── ResultGallery.tsx
│   └── ...
└── lib/
    ├── openrouter.ts          # AI API client
    ├── excel-reader.ts
    └── image-utils.ts
```

## 📝 License

MIT
