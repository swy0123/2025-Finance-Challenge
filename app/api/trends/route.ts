// app/api/trends/route.ts
import { NextResponse } from "next/server";
import type { QuoteResponse, ReportStage } from "@/types/api";

interface TrendsRequestBody {
  stage: ReportStage;      // "fxBefore" | "coin" | "fxAfter" | "final"
  query: string;
  quote?: QuoteResponse;
}

/** Perplexity REST API */
const PPLX_API_KEY = process.env.PERPLEXITY_API_KEY || "";
const PPLX_MODEL = process.env.PERPLEXITY_MODEL || "sonar";
const PPLX_URL = "https://api.perplexity.ai/chat/completions";

/** Perplexity 응답 타입(필요 필드만) */
type PplxChatMessage = { role?: string; content?: string };
type PplxChoice = { index?: number; message?: PplxChatMessage; finish_reason?: string; citations?: string[] };
type PplxResp = { id?: string; model?: string; created?: number; choices?: PplxChoice[]; usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } };

function toErrorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  try { return JSON.stringify(e); } catch { return String(e); }
}
function extractText(r: PplxResp): string {
  const t = r?.choices?.[0]?.message?.content;
  return (typeof t === "string" && t.trim().length > 0) ? t : "동향 보고서를 생성하지 못했습니다.";
}
function extractCitations(r: PplxResp): string[] {
  const c = r?.choices?.[0]?.citations;
  return Array.isArray(c) ? c.filter((x): x is string => typeof x === "string") : [];
}

const fmt = (n: number | undefined, d = 6) =>
  typeof n === "number" && Number.isFinite(n) ? Number(n.toFixed(d)) : undefined;

/** 단계별 프롬프트 */
function buildPrompt(input: TrendsRequestBody): string {
  const { stage, query, quote } = input;
  const header = `You are a bilingual (Korean-first) fintech research assistant. Be concise, numeric-first, bulleted. Add dates and levels when possible.`;

  const ctx = quote
    ? [
        `--- Simulator Context ---`,
        `Base=${quote.inputs.baseCurrency}, ViaBefore=${quote.inputs.viaFiatBefore}, ViaAfter=${quote.inputs.viaFiatAfter}, Target=${quote.inputs.targetCurrency}, Stable=${quote.inputs.stableSymbol}`,
        `FxBefore=${!!quote.inputs.enableFxBeforeCoin}, FxAfter=${!!quote.inputs.enableFxAfterCoin}, Algo=${!!quote.inputs.enableCoinAlgo ? quote.inputs.coinAlgoName ?? "ON" : "OFF"}`,
        `Fees: fxSpread%=${fmt(quote.fees.fxSpreadPct, 3)}, trade%=${fmt(quote.fees.tradePct, 3)}, network=${fmt(quote.fees.networkFixedInCoin, 6)} coin`,
        `FX: base→viaBefore=${fmt(quote.fx.baseToViaRate, 6)}, viaAfter→target=${fmt(quote.fx.viaToTargetRate, 6)} (eff: ${fmt(quote.fx.effBaseToViaRate, 6)}, ${fmt(quote.fx.effViaToTargetRate, 6)})`,
        `Coin: price(buy-currency)=${fmt(quote.coin.priceInViaFiat, 6)} at ${quote.coin.exchange}/${quote.coin.market}`,
        `Totals: base=${fmt(quote.totals.baseAmount)}, final=${fmt(quote.totals.finalTargetAmount)} ${quote.inputs.targetCurrency}, feeTotal=${fmt(quote.fees.totalFeeInTarget)}`,
        `Notes: ${(quote.hooks?.notes || []).join(" | ") || "-"}`,
        `--- End Context ---`,
      ].join("\n")
    : `--- Context ---\n(no simulator numbers provided)\n--- End Context ---`;

  if (stage === "fxBefore") {
    return [
      header,
      ctx,
      `Task: 환전1(사전: Base→ViaBefore) 최신 동향 요약(웹 검색 기반).`,
      `Include (숫자/날짜):`,
      `- KRW/USD 최근 30~90일 추이 핵심(레벨·변동폭·중요일자)`,
      `- 달러 인덱스(DXY) 개념과 최근 레벨/변동`,
      `- 사전 환전 on/off가 결과에 미치는 영향`,
      `- 사전 환전 타이밍 제안: 보수적/공격적 (근거 수치 포함)`,
      `Constraints: 불릿 6~10개, 한국어.`,
      `User Intent: ${query}`,
    ].join("\n");
  }
  if (stage === "fxAfter") {
    return [
      header,
      ctx,
      `Task: 환전2(사후: ViaAfter→Target) 최신 동향 요약(웹 검색 기반).`,
      `Include (숫자/날짜):`,
      `- KRW/USD 최근 추이 핵심 & DXY`,
      `- 사후 환전 on/off 영향`,
      `- 수취 직전 환전 타이밍 제안: 보수적/공격적`,
      `Constraints: 불릿 6~10개, 한국어.`,
      `User Intent: ${query}`,
    ].join("\n");
  }
  if (stage === "coin") {
    return [
      header,
      ctx,
      `Task: 선택 스테이블코인 및 발행기관 신뢰성 근거 요약(웹 검색 기반).`,
      `Include: 코인 일반, 발행기관 개요, 자산/준비금, 연혁, 감사/공시, 체인 유동성, 최근 이슈`,
      `Constraints: 불릿 6~10개, 한국어.`,
      `User Intent: ${query}`,
    ].join("\n");
  }
  // final
  return [
    header,
    ctx,
    `Task: 전체 파이프라인의 비용 구조/수수료율을 웹 검색 관점으로 보완.`,
    `Include: 국내·해외 송금/거래소 수수료 관행, 체인 출금 수수료, 대안 비교 및 체크리스트 3~5개`,
    `Constraints: 불릿 6~10개, 한국어.`,
    `User Intent: ${query}`,
  ].join("\n");
}

/** Perplexity 호출 */
async function callPerplexity(prompt: string): Promise<PplxResp> {
  if (!PPLX_API_KEY) throw new Error("Missing PERPLEXITY_API_KEY");
  const body = {
    model: PPLX_MODEL,
    messages: [
      { role: "system", content: "You browse the web and cite sources when helpful." },
      { role: "user", content: prompt },
    ],
    temperature: 0.3,
    top_p: 0.9,
    return_citations: true,
  };
  const res = await fetch(PPLX_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${PPLX_API_KEY}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const msg = await res.text().catch(() => "");
    throw new Error(`Perplexity HTTP ${res.status}: ${msg}`);
  }
  const json = (await res.json()) as unknown;
  return json as PplxResp;
}

export async function POST(req: Request) {
  try {
    const raw = (await req.json()) as unknown;
    if (typeof raw !== "object" || raw === null) {
      return NextResponse.json({ error: "Invalid body" }, { status: 400 });
    }
    const o = raw as Partial<TrendsRequestBody>;
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

    const pplx = await callPerplexity(prompt);
    const text = extractText(pplx);
    const citations = extractCitations(pplx);

    return NextResponse.json({ text, citations });
  } catch (err) {
    const msg = toErrorMessage(err);
    console.error("[/api/trends] error:", msg);
    return NextResponse.json({ error: "Internal error generating trends" }, { status: 500 });
  }
}
