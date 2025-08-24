// app/api/report/route.ts
import { NextResponse } from "next/server";
import type { QuoteResponse, ReportStage } from "@/types/api";

/** 요청 바디 */
interface ReportRequestBody {
  stage: ReportStage;      // "fxBefore" | "coin" | "fxAfter" | "final"
  query: string;           // UI에서 전달한 의도 설명
  quote?: QuoteResponse;   // 선택 (가능하면 포함)
}

/** Gemini 설정 */
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-1.5-flash";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

/** 응답 타입(필요 필드만) */
type GeminiPart = { text?: string };
type GeminiContent = { parts?: GeminiPart[] };
type GeminiCandidate = { content?: GeminiContent };
type GeminiResp = { candidates?: GeminiCandidate[] };

function toErrorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  try { return JSON.stringify(e); } catch { return String(e); }
}

function extractGeminiText(resp: GeminiResp): string {
  const parts = resp?.candidates?.[0]?.content?.parts;
  const txt = parts?.map((p) => p.text || "").join("\n").trim();
  return txt && txt.length > 0 ? txt : "결과를 생성하지 못했습니다.";
}

const fmt = (n: number | undefined, d = 6) =>
  typeof n === "number" && Number.isFinite(n) ? Number(n.toFixed(d)) : undefined;

/** 단계별 프롬프트 */
function buildPrompt(input: ReportRequestBody): string {
  const { stage, query, quote } = input;
  const header = `You are a bilingual (Korean-first) fintech analyst. Keep it concise, numeric-first, bullet style.`;

  const baseCtx = quote
    ? [
        `--- Context (from simulator) ---`,
        `Base=${quote.inputs.baseCurrency}, ViaBefore=${quote.inputs.viaFiatBefore}, ViaAfter=${quote.inputs.viaFiatAfter}, Target=${quote.inputs.targetCurrency}`,
        `Stable=${quote.inputs.stableSymbol}, FxBefore=${!!quote.inputs.enableFxBeforeCoin}, FxAfter=${!!quote.inputs.enableFxAfterCoin}`,
        `Algo=${!!quote.inputs.enableCoinAlgo ? quote.inputs.coinAlgoName ?? "ON" : "OFF"}`,
        `Fees: fxSpread%=${fmt(quote.fees.fxSpreadPct, 3)}, trade%=${fmt(quote.fees.tradePct, 3)}, network=${fmt(quote.fees.networkFixedInCoin, 6)} coin`,
        `FX: base→viaBefore=${fmt(quote.fx.baseToViaRate, 6)}, viaAfter→target=${fmt(quote.fx.viaToTargetRate, 6)} (eff: ${fmt(quote.fx.effBaseToViaRate, 6)}, ${fmt(quote.fx.effViaToTargetRate, 6)})`,
        `Coin: price(buy-currency)=${fmt(quote.coin.priceInViaFiat, 6)} at ${quote.coin.exchange}/${quote.coin.market}`,
        `Totals: base=${fmt(quote.totals.baseAmount)}, final=${fmt(quote.totals.finalTargetAmount)} ${quote.inputs.targetCurrency}, feeTotal=${fmt(quote.fees.totalFeeInTarget)}`,
        `Notes: ${(quote.hooks?.notes || []).join(" | ") || "-"}`,
        `--- End Context ---`,
      ].join("\n")
    : `--- Context ---\n(no quote provided)\n--- End Context ---`;

  if (stage === "fxBefore") {
    return [
      header,
      baseCtx,
      `Task: 환전1(사전: Base→ViaBefore) 단계 리포트.`,
      `Include:`,
      `- 선택 옵션이 결과에 미치는 영향(사전 환전 on/off)`,
      `- KRW/USD 최근 추이 요약(숫자/날짜), 달러 인덱스(DXY) 개념과 최근 흐름`,
      `- 현재 맥락에서 사전 환전 타이밍/가격대 제안 (보수적/공격적)`,
      `- 리스크 체크리스트(변동성·수수료·체류시간 등)`,
      `Constraints: 5~10 불릿, 한국어 우선, 과도한 단정 금지.`,
      `User Intent: ${query}`,
    ].join("\n");
  }
  if (stage === "fxAfter") {
    return [
      header,
      baseCtx,
      `Task: 환전2(사후: ViaAfter→Target) 단계 리포트.`,
      `Include:`,
      `- 선택 옵션이 결과에 미치는 영향(사후 환전 on/off)`,
      `- KRW/USD 최근 추이 요약(숫자/날짜), DXY 개념/흐름`,
      `- 수취 직전 환전 타이밍/가격대 제안 (보수적/공격적)`,
      `- 리스크 체크리스트(유동성·체류시간·스프레드 등)`,
      `Constraints: 5~10 불릿, 한국어 우선.`,
      `User Intent: ${query}`,
    ].join("\n");
  }
  if (stage === "coin") {
    return [
      header,
      baseCtx,
      `Task: 코인 단계 리포트.`,
      `Include:`,
      `- 스테이블코인(${quote?.inputs.stableSymbol ?? "USDT/USDC"}) 일반 정보`,
      `- 발행 기관 개요`,
      `- 신뢰성 근거: 자산·준비금, 설립 연식/추이, 감사/공시 등`,
      `- 현재 맥락에서 유의점(유동성, 상장시장, 체인/출금 수수료)`,
      `Constraints: 5~10 불릿, 한국어 우선.`,
      `User Intent: ${query}`,
    ].join("\n");
  }
  // final
  return [
    header,
    baseCtx,
    `Task: 최종 종합 리포트.`,
    `Include:`,
    `- 입력→최종 단계별 비용/손실 요인 요약`,
    `- 총 수수료율(%) 및 절대금액(${quote?.inputs.targetCurrency ?? "KRW"})`,
    `- 민감도: 사전/사후 환전 on/off, 트레이드%/네트워크 수수료 변화`,
    `- 비용 최소화 체크리스트 3~5개`,
    `Constraints: 5~10 불릿, 수치 우선.`,
    `User Intent: ${query}`,
  ].join("\n");
}

async function callGemini(prompt: string): Promise<string> {
  if (!GEMINI_API_KEY) throw new Error("Missing GEMINI_API_KEY");
  const body = {
    contents: [
      { role: "user", parts: [{ text: prompt }] },
    ],
  };
  const res = await fetch(GEMINI_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const msg = await res.text().catch(() => "");
    throw new Error(`Gemini HTTP ${res.status}: ${msg}`);
  }
  const json = (await res.json()) as unknown as GeminiResp;
  return extractGeminiText(json);
}

export async function POST(req: Request) {
  try {
    const raw = (await req.json()) as unknown;
    if (typeof raw !== "object" || raw === null) {
      return NextResponse.json({ error: "Invalid body" }, { status: 400 });
    }
    const o = raw as Partial<ReportRequestBody>;
    if (o.stage !== "fxBefore" && o.stage !== "coin" && o.stage !== "fxAfter" && o.stage !== "final") {
      return NextResponse.json({ error: "Invalid 'stage'" }, { status: 400 });
    }
    if (typeof o.query !== "string" || o.query.trim().length === 0) {
      return NextResponse.json({ error: "Missing 'query' string" }, { status: 400 });
    }

    const prompt = buildPrompt({
      stage: o.stage,
      query: o.query,
      quote: o.quote as QuoteResponse | undefined,
    });

    const text = await callGemini(prompt);

    return NextResponse.json({ searchSummary: "", analysis: text });
  } catch (err) {
    const msg = toErrorMessage(err);
    console.error("[/api/report] error:", msg);
    return NextResponse.json({ error: "Internal error generating report" }, { status: 500 });
  }
}
