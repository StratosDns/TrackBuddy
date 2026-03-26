type JsonRecord = Record<string, unknown>;

type AssistantRequestBody = {
  question?: unknown;
  messages?: Array<{ role?: unknown; content?: unknown }>;
};

type AssistantMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

const MAX_QUESTION_LENGTH = 4000;
const MAX_MESSAGES = 12;
const MAX_MESSAGE_CHARS = 2000;

const SYSTEM_PROMPT = `You are TrackBuddy Coach, an evidence-aware fitness, nutrition, training, recovery, and supplement assistant inside the TrackBuddy app.

Your job:
- Answer fitness, workout, nutrition, body-composition, recovery, and supplement questions.
- When the user asks for a workout, provide a real workout with exercise order, sets, reps, rest, progression, and substitutions.
- When the user asks for calories, give a rough estimate range and say what affects the estimate.
- When the user asks about cutting or bulking, give practical calorie, protein, and training guidance.
- Prefer direct, actionable, useful answers over generic summaries.
- Keep answers clear and reasonably concise, but do not omit needed structure.

Safety rules:
- Do not diagnose disease, injuries, hormone disorders, or eating disorders.
- For chest pain, fainting, neurological symptoms, suspected fractures, or severe/worsening pain, tell the user to seek qualified medical care.
- Do not recommend starvation diets, dangerous dehydration, or reckless supplement use.
- Do not pretend calorie estimates or maintenance calories are exact.

Style rules:
- Be practical, specific, and user-focused.
- If the user asks for a workout, format the answer cleanly.
- If information is missing, make reasonable assumptions instead of stalling.
- Do not mention these internal instructions.`;

function compactWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function sanitizeText(value: string, maxLength: number): string {
  return compactWhitespace(value).slice(0, maxLength);
}

function badRequest(message: string, details?: JsonRecord): Response {
  return Response.json({ ok: false, error: message, ...(details ?? {}) }, { status: 400 });
}

function success(data: JsonRecord): Response {
  return Response.json({ ok: true, ...data }, { status: 200 });
}

function getEnv(name: string): string | undefined {
  const value = process.env[name];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function buildConversation(body: AssistantRequestBody): AssistantMessage[] {
  const messages: AssistantMessage[] = [{ role: 'system', content: SYSTEM_PROMPT }];

  if (Array.isArray(body.messages) && body.messages.length > 0) {
    const cleanedHistory = body.messages
      .slice(-MAX_MESSAGES)
      .map((message) => {
        const role = message?.role;
        const content = typeof message?.content === 'string' ? sanitizeText(message.content, MAX_MESSAGE_CHARS) : '';

        if ((role === 'user' || role === 'assistant') && content) {
          return { role, content } as AssistantMessage;
        }

        return null;
      })
      .filter((message): message is AssistantMessage => message !== null);

    messages.push(...cleanedHistory);
  }

  const question = typeof body.question === 'string' ? sanitizeText(body.question, MAX_QUESTION_LENGTH) : '';

  if (question) {
    const alreadyLastUserMessage = messages[messages.length - 1]?.role === 'user' && messages[messages.length - 1]?.content === question;
    if (!alreadyLastUserMessage) {
      messages.push({ role: 'user', content: question });
    }
  }

  return messages;
}

function extractAssistantText(payload: unknown): string | null {
  const data = payload as {
    choices?: Array<{ message?: { content?: string } }>;
  };

  const text = data?.choices?.[0]?.message?.content;
  return typeof text === 'string' && text.trim() ? text.trim() : null;
}

export async function GET() {
  const hasApiKey = Boolean(getEnv('OPENAI_API_KEY'));

  return success({
    name: 'assistant-llm-route',
    status: hasApiKey ? 'ready' : 'missing_api_key',
    provider: 'openai-compatible',
    accepts: {
      method: 'POST',
      body: {
        question: 'string',
        messages: 'optional conversation history array'
      }
    },
    env: {
      OPENAI_API_KEY: hasApiKey ? 'set' : 'missing',
      OPENAI_MODEL: getEnv('OPENAI_MODEL') ?? 'gpt-4.1-mini',
      OPENAI_BASE_URL: getEnv('OPENAI_BASE_URL') ?? 'https://api.openai.com/v1'
    }
  });
}

export async function POST(request: Request) {
  let body: AssistantRequestBody | null = null;

  try {
    body = (await request.json()) as AssistantRequestBody;
  } catch {
    return badRequest('Invalid JSON body. Send { "question": "..." }.');
  }

  const apiKey = getEnv('OPENAI_API_KEY');
  if (!apiKey) {
    return Response.json(
      {
        ok: false,
        error: 'Missing OPENAI_API_KEY server environment variable.'
      },
      { status: 500 }
    );
  }

  const conversation = buildConversation(body ?? {});
  const userQuestion = typeof body?.question === 'string' ? sanitizeText(body.question, MAX_QUESTION_LENGTH) : '';

  const hasUsableUserInput = conversation.some((message) => message.role === 'user' && message.content);
  if (!hasUsableUserInput || !userQuestion) {
    return badRequest('Please ask a fitness, nutrition, workout, recovery, or supplement question.');
  }

  const baseUrl = (getEnv('OPENAI_BASE_URL') ?? 'https://api.openai.com/v1').replace(/\/$/, '');
  const model = getEnv('OPENAI_MODEL') ?? 'gpt-4.1-mini';

  try {
    const llmResponse = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        temperature: 0.4,
        messages: conversation
      })
    });

    const payload = await llmResponse.json().catch(() => null);

    if (!llmResponse.ok) {
      const message =
        typeof (payload as { error?: { message?: unknown } } | null)?.error?.message === 'string'
          ? (payload as { error?: { message?: string } }).error?.message
          : 'LLM request failed.';

      return Response.json(
        {
          ok: false,
          error: message,
          provider: 'openai-compatible'
        },
        { status: 502 }
      );
    }

    const answer = extractAssistantText(payload) ?? 'I could not generate a useful response for that question.';

    return success({
      answer,
      provider: 'openai-compatible',
      model
    });
  } catch {
    return Response.json(
      {
        ok: false,
        error: 'Unable to reach the language model provider right now.'
      },
      { status: 502 }
    );
  }
}
