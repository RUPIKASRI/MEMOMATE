import { NextResponse } from 'next/server';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// we will use the "gemini-1.5-flash" model (cheap + fast)
const GEMINI_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent';

export async function POST(req: Request) {
  try {
    if (!GEMINI_API_KEY) {
      console.error('Missing GEMINI_API_KEY');
      return NextResponse.json(
        { error: 'Gemini API key not configured' },
        { status: 500 },
      );
    }

    const { question, notes } = await req.json();

    const contextText = (notes as { content: string; tags?: string[]; created_at?: string }[])
      .map((n) => {
        const tags = n.tags && n.tags.length > 0 ? ` [tags: ${n.tags.join(', ')}]` : '';
        const date = n.created_at ? ` [saved on: ${n.created_at}]` : '';
        return `- ${n.content}${tags}${date}`;
      })
      .join('\n');

    const prompt = `
You are Memomate, a personal memory assistant.
The user is asking a question based only on THEIR OWN NOTES.

User question:
"${question}"

Here are some of their relevant notes:
${contextText || '(no notes given)'}

Answer clearly and briefly, using only information that can be reasonably inferred from the notes.
If you are not sure, say you are not completely sure and suggest what they could check.
`.trim();

    const res = await fetch(`${GEMINI_URL}?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [{ text: prompt }],
          },
        ],
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error('Gemini API error:', errText);
      return NextResponse.json(
        { error: 'Failed to call Gemini API' },
        { status: 500 },
      );
    }

    const data = await res.json();

    const answer =
      data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ||
      '';

    return NextResponse.json({ answer });
  } catch (err) {
    console.error('Error in /api/ask:', err);
    return NextResponse.json({ error: 'Failed to generate answer' }, { status: 500 });
  }
}
