// app/api/trends/route.ts
import { NextResponse } from "next/server";

/**
 * 최신 동향 보고서 (Perplexity API)
 *
 * POST /api/trends
 * body: { query: string }
 *
 * ENV:
 *  - PERPLEXITY_API_KEY (필수)
 *  - PERPLEXITY_MODEL   (선택, 기본 "sonar")
 *
 * 참고: Perplexity API는 OpenAI Chat Completions 호환 형태
 *  - endpoint: https://api.perplexity.ai/chat/completions
 *  - model 예시: "sonar", "sonar-pro", "sonar-small-online"
 */
const PPLX_KEY = process.env.PERPLEXITY_API_KEY;
const PPLX_MODEL = process.env.PERPLEXITY_MODEL || "sonar";
const PPLX_URL = "https://api.perplexity.ai/chat/completions";

if (!PPLX_KEY) {
  console.warn("[/api/trends] Missing PERPLEXITY_API_KEY");
}

interface TrendsReqBody {
  query: string;
}

export async function POST(req: Request) {
  try {
    const { query } = (await req.json()) as TrendsReqBody;

    if (!query || typeof query !== "string") {
      return NextResponse.json({ error: "Missing 'query' string" }, { status: 400 });
    }
    if (!PPLX_KEY) {
      return NextResponse.json({ error: "Server misconfigured: PERPLEXITY_API_KEY not set" }, { status: 500 });
    }

    // 간결한 동향 리포트 요청 프롬프트
    const systemPrompt =
      "You are a research assistant. Return a concise, up-to-date trend brief for the given query. " +
      "Focus on recent developments (last 30-90 days), practical implications for remittance and stablecoin trading, " +
      "and notable risks (liquidity, regulation). Keep it within 6-10 bullet lines. Korean language.";

    const userPrompt =
      `키워드: ${query}\n\n` +
      "요구사항:\n" +
      "- 표나 그래프 없이 핵심만 bullet로.\n" +
      "- 날짜/수치/기관명 등 근거 가능 정보는 간단히 함께 표기.\n" +
      "- 마지막에 '체크리스트' 2~3줄로 요약.";

    // Perplexity API 호출 (citations 요청)
    const pplxRes = await fetch(PPLX_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${PPLX_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: PPLX_MODEL,
        temperature: 0.2,
        top_p: 0.9,
        // Perplexity 확장 파라미터 (가용 시):
        // return_citations: true,
        // search_domain_filter: ["news","finance"],
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
    });

    const raw = await pplxRes.text();
    if (!pplxRes.ok) {
      console.error("[/api/trends] Perplexity error:", raw);
      return NextResponse.json({ error: "Perplexity API call failed" }, { status: 500 });
    }

    let data: any = null;
    try {
      data = JSON.parse(raw);
    } catch {
      // 비정형 응답 방어
      data = { choices: [{ message: { content: raw } }] };
    }

    // OpenAI 호환: choices[0].message.content
    const text: string =
      data?.choices?.[0]?.message?.content ??
      data?.choices?.[0]?.text ??
      "동향 보고서를 불러오지 못했습니다.";

    // Perplexity 인용 URL 추출 (버전별 구조 대비)
    const citations: string[] =
      data?.citations ??
      data?.choices?.[0]?.message?.citations ??
      data?.choices?.[0]?.citations ??
      [];

    return NextResponse.json({
      text,
      citations,
      model: PPLX_MODEL,
    });
  } catch (err: any) {
    console.error("[/api/trends] error:", err?.message || err);
    return NextResponse.json({ error: "Internal error generating trends" }, { status: 500 });
  }
}
