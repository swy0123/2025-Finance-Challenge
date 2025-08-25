// app/api/trends/route.ts
import { NextResponse } from "next/server";
import type { QuoteResponse, ReportStage } from "@/types/api";

interface TrendsRequestBody {
  stage: ReportStage;
  query: string;
  quote?: QuoteResponse;
}

const PPLX_API_KEY = process.env.PERPLEXITY_API_KEY || "";
const PPLX_MODEL = process.env.PERPLEXITY_MODEL || "sonar";
const PPLX_URL = "https://api.perplexity.ai/chat/completions";

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

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

/** 단계별 프롬프트 — 최근 3일을 '라인 로그'로, 테이블/코드블록 금지 */
function buildPrompt(input: TrendsRequestBody): string {
  const { stage, query, quote } = input;

  const header =
`You are a bilingual (Korean-first) fintech research assistant.
Return concise bullets and a **3-day line log**. Cite reliable sources for numbers.
Do **not** use markdown tables or code blocks.`;

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

  // 공통: “최근 3일 라인 로그” 형식 정의
  const threeDayLineLog =
`Add a **3-day line log** in reverse chronological order (today=${todayISO()} included).
Each line must follow exactly this pattern (no tables, no code blocks):
- YYYY-MM-DD — USD/KRW: <value> ; Dollar Index: <value>  (source)
If official DXY is unavailable, use FRED Nominal Broad U.S. Dollar Index (DTWEXBGS) as a proxy.
Keep values short (few decimals).`;

  if (stage === "fxBefore") {
    return [
      header,
      ctx,
      `Task: 환전1(사전: Base→ViaBefore) 최신 동향(웹 검색 기반).`,
      threeDayLineLog,
      `Answer with three labeled sections (A/B/C) in Korean:`,
      `A) 일반적인 환율 추이 + "**오늘(${todayISO()})의 달러/원 환율**"을 명시 (간결 수치).`,
      `B) 위의 **3-day line log**를 그대로 제시.`,
      `C) **AI가 추천하는 사전 환전 시점·거래 총량·가격**을 보수적/공격적 2안으로 제시.`,
      `   - 근거와 리스크(스프레드·유동성·체류시간)를 간단히 수치로.`,
      `User Intent: ${query}`,
    ].join("\n");
  }

  if (stage === "coin") {
    return [
      header,
      ctx,
      `Task: 코인 단계(USDT/USDC 등) 최신 동향/설명(웹 검색 기반).`,
      `Answer with three labeled sections (A/B/C) in Korean:`,
      `A) **Krugal Model 기반 USDT(테더) 가격 결정 이론** 가정하에 "**${todayISO()} 현재 USDT 가격**" 평가(개념/한계 명시).`,
      `B) **적용 알고리즘 설명** 및 비교(블랙-숄즈 vs Krugal 등), 코인 네트워크 송금의 장단점(수수료·유동성·혼잡).`,
      `C) **상황별 의사결정**(예: "$5,000 이하(≈600만원) 송금") — 코인 네트워크 vs 대안 비교(수수료·속도·리스크)`,
      `User Intent: ${query}`,
    ].join("\n");
  }

  if (stage === "fxAfter") {
    return [
      header,
      ctx,
      `Task: 환전2(사후: ViaAfter→Target) 최신 동향(웹 검색 기반).`,
      threeDayLineLog,
      `Answer with three labeled sections (A/B/C) in Korean:`,
      `A) 일반적인 환율 추이 + "**오늘(${todayISO()})의 원/달러 환율**"을 명시 (간결 수치).`,
      `B) 위의 **3-day line log**를 그대로 제시.`,
      `C) **AI가 추천하는 사후 환전 시점·거래 총량·가격**을 보수적/공격적 2안으로 제시(수취 직전 전략 포함).`,
      `User Intent: ${query}`,
    ].join("\n");
  }

  // final
  return [
    header,
    ctx,
    `Task: 전체 파이프라인(환전1→코인→환전2)의 비용/리스크를 최근 3일 지표로 보완(웹 검색 기반).`,
    threeDayLineLog,
    `Answer with three labeled sections (A/B/C) in Korean:`,
    `A) 최근 3일 USD/KRW & 달러지수 변동이 **총비용**(수수료율/절대금액)에 미치는 영향.`,
    `B) 국내·해외 송금/거래소 수수료 관행, 체인 출금비, 대안 비교(최근 3일 내 변화 강조).`,
    `C) 비용·리스크 최소화 체크리스트 3~5개(실행 가능 항목, 수치 위주).`,
    `User Intent: ${query}`,
  ].join("\n");
}

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
