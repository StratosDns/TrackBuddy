# Direct LLM Assistant Setup

This project now includes a direct LLM-backed assistant route at:

- `app/api/assistant-llm/route.ts`

## What it does
- sends the user's question directly to an OpenAI-compatible chat completions endpoint
- uses a built-in system prompt for fitness, nutrition, recovery, and workout coaching
- supports optional conversation history via `messages`

## Required environment variables

Add these on the server:

```bash
OPENAI_API_KEY=your_api_key_here
```

Optional:

```bash
OPENAI_MODEL=gpt-4.1-mini
OPENAI_BASE_URL=https://api.openai.com/v1
```

## Frontend switch

Update the assistant bubble fetch target from:

```ts
fetch('/api/assistant', ...)
```

to:

```ts
fetch('/api/assistant-llm', ...)
```

## Optional request body shape

```json
{
  "question": "Give me an advanced back workout",
  "messages": [
    { "role": "user", "content": "I train 4 days per week" },
    { "role": "assistant", "content": "Got it." }
  ]
}
```

## Notes
- the route is server-side, so the API key stays on the server
- the route currently uses an OpenAI-compatible `/chat/completions` API
- if you later want streaming, tools, structured outputs, or retrieval, this route is the right place to extend
