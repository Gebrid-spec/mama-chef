import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const { prompt } = await req.json();

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "GEMINI_API_KEY is missing" },
        { status: 500 }
      );
    }

    const r = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent?key=" +
        apiKey,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: String(prompt ?? "") }] }],
        }),
      }
    );

    if (!r.ok) {
      const text = await r.text();
      return NextResponse.json(
        { error: "Gemini API error", details: text },
        { status: 500 }
      );
    }

    const data = await r.json();
    const text =
      data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "No response";

    return NextResponse.json({ text });
  } catch (e: any) {
    return NextResponse.json(
      { error: "Server error", details: String(e?.message ?? e) },
      { status: 500 }
    );
  }
}
