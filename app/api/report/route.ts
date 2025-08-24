// app/api/report/route.ts
import { NextResponse } from "next/server";
import type { QuoteResponse, ReportApiResponse } from "@/types/api";

/**
 * /api/report
 * - POST 요청으로 쿼리(query)와 quote 결과(optional)를 전달받아 Gemini에 분석 요청
 * - 환경변수: GEMINI_API_KEY
 */

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-1.5-flash";

if (!GEMINI_API_KEY) {
  console.warn("[/api/report] Missing GEMINI_API_KEY");
}

interface ReportRequestBody {
  query: string;
  quote?: QuoteResponse; // /api/quote 결과를 그대로 전달받을 수 있음
}

export async function POST(req: Request) {
  try {
    const body: ReportRequestBody = await req.json();
    const { query, quote } = body;

    if (!query) {
      return NextResponse.json({ error: "Missing query" }, { status: 400 });
    }

    // 프롬프트 구성
    let prompt = `사용자가 요청한 분석 주제: ${query}\n\n`;
    if (quote) {
      prompt += `추가 수치 데이터 (참고용):\n${JSON.stringify(quote, null, 2)}\n\n`;
    }
    prompt += `위 정보를 바탕으로, 스테이블코인 송금/거래의 적절성 및 주의사항을 간단히 요약해 주세요.
- 지나치게 장황하지 말고 3~4문장 이내로 정리
- 현재 시점에서의 기회/위험 요소를 함께 언급
`;

    // Gemini API 호출
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [{ text: prompt }],
          },
        ],
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error("[/api/report] Gemini error:", errText);
      return NextResponse.json(
        { error: "Gemini API call failed" },
        { status: 500 }
      );
    }

    const data = await res.json();
    const text =
      data?.candidates?.[0]?.content?.parts?.[0]?.text ||
      "분석 결과를 불러오지 못했습니다.";

    const payload: ReportApiResponse = {
      searchSummary: query,
      analysis: text,
    };

    return NextResponse.json(payload);
  } catch (err) {
    console.error("[/api/report] error:", err);
    return NextResponse.json(
      { error: "Internal error generating report" },
      { status: 500 }
    );
  }
}
