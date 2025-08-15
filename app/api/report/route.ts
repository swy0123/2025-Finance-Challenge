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

    const geminiRes = await model.generateContent({
      contents: [
        {
          parts: [{ text: `다음 내용을 기반으로 한국어로 간결하게 요약하고 전망 분석을 작성해줘:\n\n${searchSummary}` }],
        },
      ],
    });

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
