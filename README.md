# Agentic Resume AI

NestJS + Prisma + MongoDB backend that tailors resumes to job descriptions using Google Gemini AI.

## Features

- **JD Analysis** — Extracts required skills, seniority, and domain context from job descriptions via Gemini
- **Semantic Matching** — Embeds resume bullets and JD text, ranks by cosine similarity
- **AI Rewriting** — Rewrites bullet points to align with JD terminology while preserving facts
- **4-Gate Validation** — Semantic fidelity, keyword coverage, hallucination detection, structural rules
- **PDF Generation** — ATS-safe PDF output via Puppeteer with Handlebars templating
- **Rate Limiting** — Built-in RPM throttling and 429 retry with exponential backoff
- **MongoDB Persistence** — Embedding cache and resume artifacts stored via Prisma ORM

## Quick Start

```bash
# Install dependencies
npm install

# Set up your .env (update DATABASE_URL and GEMINI_API_KEY)
cp .env.example .env

# Generate Prisma client
npx prisma generate

# Push schema to MongoDB
npx prisma db push

# Start dev server
npm run start:dev
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check |
| POST | `/generate` | Raw Gemini text generation |
| POST | `/api/v1/generate-resume` | Generate tailored resume |
| GET | `/api/v1/resumes/:id` | Get resume metadata |
| GET | `/api/v1/resumes/:id/pdf` | Download generated PDF |

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `GEMINI_API_KEY` | *(required)* | Google AI Studio API key |
| `GEMINI_MODEL` | `gemini-2.0-flash` | Gemini model for text generation |
| `GEMINI_EMBEDDING_MODEL` | `models/gemini-embedding-001` | Embedding model |
| `GEMINI_RPM_LIMIT` | `4` | Max requests per minute (free tier: set to 4) |
| `DATABASE_URL` | *(required)* | MongoDB connection string |
| `TOP_N_BULLETS` | `15` | Number of bullets to shortlist |
| `FIDELITY_THRESHOLD` | `0.90` | Minimum semantic fidelity score |
| `OUTPUT_DIR` | `output/resumes` | PDF output directory |

## Tech Stack

- **Runtime**: Node.js + NestJS
- **Database**: MongoDB via Prisma ORM
- **AI**: Google Gemini (text generation + embeddings)
- **PDF**: Puppeteer + Handlebars
- **Validation**: class-validator + class-transformer
