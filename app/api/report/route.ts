import { NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const query = searchParams.get("query") || "비트코인 전망";

    console.log(query);
    // 1. Perplexity 검색
    const ppxRes = await fetch("https://api.perplexity.ai/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.PERPLEXITY_API_KEY}`,
        "Content-Type": "application/json",
      },

      body: JSON.stringify({
        model: "sonar-pro",
        messages: [{ role: "user", content: `Search latest analysis about ${query}` }],
      }),
    });

    const ppxData = await ppxRes.json();
    const searchSummary = ppxData.choices?.[0]?.message?.content || "검색 결과 없음";

    // 2. Gemini 요약
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

    const prompt =
      `아래 내용을 한국어로 간결히 요약하고, *핵심 포인트 3개*와 *단기/중기 전망*을 bullet로 정리해줘.\n\n` +
      `=== 원문 시작 ===\n${searchSummary}\n=== 원문 끝 ===`;

    const geminiRes = await model.generateContent(prompt);
    const geminiOutput = geminiRes.response.text();


    return NextResponse.json({
      success: true,
      query,
      searchSummary,
      analysis: geminiOutput,
    });

  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}
