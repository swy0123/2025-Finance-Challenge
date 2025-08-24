// app/api/quote/route.ts
import { NextResponse } from "next/server";
import type {
  QuoteRequest,
  QuoteResponse,
  Currency,
  StableSymbol,
  RateApiResponse,
  PriceApiResponse,
  CoinAlgoName,
} from "@/types/api";

type Fiat = "KRW" | "USD";

const SUPPORTED_FIAT: Currency[] = ["KRW", "USD"];
const SUPPORTED_STABLE: StableSymbol[] = ["USDT", "USDC"];

function badRequest(msg: string) {
  return NextResponse.json({ error: msg }, { status: 400 });
}

/** 절대 URL 생성 */
function makeAbs(origin: string, path: string) {
  return `${origin}${path.startsWith("/") ? path : `/${path}`}`;
}

/** 내부 라우트: 환율 조회 */
async function getRate(origin: string, base: Currency, quote: Currency): Promise<RateApiResponse> {
  const url = makeAbs(origin, `/api/rate?base=${base}&quote=${quote}`);
  const res = await fetch(url, { cache: "no-store" });
  const json = await res.json();
  if (!res.ok || json?.error) throw new Error(`rate api failed ${base}->${quote}: ${json?.error || res.status}`);
  return json as RateApiResponse;
}

/** 내부 라우트: 업비트 KRW 마켓 가격 (KRW-<symbol>) */
async function getPriceKRW(origin: string, symbol: StableSymbol): Promise<PriceApiResponse> {
  const url = makeAbs(origin, `/api/price?symbol=${symbol}&market=KRW`);
  const res = await fetch(url, { cache: "no-store" });
  const json = await res.json();
  if (!res.ok || json?.error) throw new Error(`price api failed for ${symbol} (KRW): ${json?.error || res.status}`);
  return json as PriceApiResponse;
}

/** KRW 기준 가격을 요청 통화로 환산한 1코인 가격 */
async function priceInCurrency(origin: string, symbol: StableSymbol, fiat: Fiat): Promise<number> {
  const krwPrice = (await getPriceKRW(origin, symbol)).price; // KRW 기준
  if (fiat === "KRW") return krwPrice;
  const usdkrw = await getRate(origin, "USD", "KRW"); // 1 USD = x KRW
  return krwPrice / usdkrw.rate; // KRW → USD
}

/** 코인 단계 알고리즘 적용 훅 */
function applyCoinAlgorithm(input: {
  enabled: boolean;
  algoName?: CoinAlgoName;
  coinAfterNetwork: number;
  buyCurrency: Fiat;
  sellCurrency: Fiat;
  buyPrice: number;   // buy 통화 기준
  sellPrice: number;  // sell 통화 기준
}): { coinForSell: number; notes: string[] } {
  const notes: string[] = [];

  if (!input.enabled || !input.algoName || input.algoName === "NONE") {
    notes.push("coin algorithm disabled");
    return { coinForSell: input.coinAfterNetwork, notes };
  }

  switch (input.algoName) {
    case "AAAA": {
      const coinForSell = Math.max(0, input.coinAfterNetwork * 0.9);
      notes.push("algorithm AAAA applied: coinAfterNetwork × 0.9");
      return { coinForSell, notes };
    }
    default: {
      notes.push(`unknown algorithm '${input.algoName}', skipped`);
      return { coinForSell: input.coinAfterNetwork, notes };
    }
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as QuoteRequest;

    // origin 계산 (배포/로컬 대응)
    const envOrigin = (process.env.NEXT_PUBLIC_BASE_URL || "").replace(/\/$/, "");
    const reqOrigin = new URL(req.url).origin;
    const origin = envOrigin || reqOrigin;

    // ----- 입력 검증 -----
    if (!body || typeof body.amount !== "number" || body.amount <= 0) return badRequest("amount must be a positive number");

    const { baseCurrency, viaFiatBefore, viaFiatAfter, stableSymbol, targetCurrency } = body;

    if (!SUPPORTED_FIAT.includes(baseCurrency)) return badRequest("unsupported baseCurrency");
    if (!SUPPORTED_FIAT.includes(viaFiatBefore)) return badRequest("unsupported viaFiatBefore");
    if (!SUPPORTED_FIAT.includes(viaFiatAfter)) return badRequest("unsupported viaFiatAfter");
    if (!SUPPORTED_FIAT.includes(targetCurrency)) return badRequest("unsupported targetCurrency");
    if (!SUPPORTED_STABLE.includes(stableSymbol)) return badRequest("unsupported stableSymbol");

    const fxSpreadPct = Math.max(0, body.fee?.fxSpreadPct ?? 0);
    const tradePct = Math.max(0, body.fee?.tradePct ?? 0);
    const networkFixedInCoin = Math.max(0, body.fee?.networkFixedInCoin ?? 0);

    // 단계 옵션
    const enableFxBeforeCoin = body.enableFxBeforeCoin ?? true;
    const enableFxAfterCoin  = body.enableFxAfterCoin  ?? true;

    // 코인 알고리즘 옵션
    const enableCoinAlgo: boolean = body.enableCoinAlgo ?? false;
    const coinAlgoName: CoinAlgoName = body.coinAlgoName ?? "NONE";

    // ----- 1) 단계별 거래 통화 결정 -----
    const buyCurrency: Fiat  = enableFxBeforeCoin ? (viaFiatBefore as Fiat) : (baseCurrency as Fiat);
    const sellCurrency: Fiat = enableFxAfterCoin  ? (viaFiatAfter  as Fiat) : (targetCurrency as Fiat);

    // ----- 2) 필요한 환율만 조회 -----
    // Base → ViaBefore
    const baseToViaRate =
      enableFxBeforeCoin && baseCurrency !== viaFiatBefore
        ? (await getRate(origin, baseCurrency, viaFiatBefore)).rate
        : 1;

    // ViaAfter → Target
    const viaToTargetRate =
      enableFxAfterCoin && viaFiatAfter !== targetCurrency
        ? (await getRate(origin, viaFiatAfter, targetCurrency)).rate
        : 1;

    const effBaseToViaRate   = enableFxBeforeCoin ? baseToViaRate   * (1 - fxSpreadPct / 100) : 1;
    const effViaToTargetRate = enableFxAfterCoin  ? viaToTargetRate * (1 - fxSpreadPct / 100) : 1;

    // ----- 3) 코인 가격 (매수/매도 통화 기준) -----
    const buyPrice  = await priceInCurrency(origin, stableSymbol, buyCurrency);
    const sellPrice = await priceInCurrency(origin, stableSymbol, sellCurrency);

    // ----- 4) 금액 흐름 -----
    const baseAmount = body.amount;

    // (a) 환전1: base → buyCurrency
    const cashForBuy =
      enableFxBeforeCoin && baseCurrency !== buyCurrency ? baseAmount * effBaseToViaRate : baseAmount;

    // (b) 코인 매수 (수수료 %)
    const buyFee = cashForBuy * (tradePct / 100);         // buyCurrency 단위
    const coinAmount = Math.max(0, (cashForBuy - buyFee) / buyPrice);

    // (c) 네트워크 수수료(코인 수량) 차감
    const coinAfterNetwork = Math.max(0, coinAmount - networkFixedInCoin);
    const networkFeeInBuy = networkFixedInCoin * buyPrice; // buyCurrency 단위 비용

    // (d) === 코인 알고리즘 적용 ===
    const algoResult = applyCoinAlgorithm({
      enabled: enableCoinAlgo,
      algoName: coinAlgoName,
      coinAfterNetwork,
      buyCurrency,
      sellCurrency,
      buyPrice,
      sellPrice,
    });
    const coinForSell = algoResult.coinForSell;

    // (e) 코인 매도 → sellCurrency
    const grossSell = coinForSell * sellPrice;      // sellCurrency
    const sellFee = grossSell * (tradePct / 100);   // sellCurrency
    const cashAfterSell = Math.max(0, grossSell - sellFee); // sellCurrency

    // (f) 환전2: sellCurrency → targetCurrency
    const finalTargetAmount =
      enableFxAfterCoin && sellCurrency !== targetCurrency
        ? cashAfterSell * effViaToTargetRate
        : cashAfterSell;

    // ----- 5) 총 수수료(최종 통화로 환산) -----
    const buyToSellFactor = buyPrice > 0 ? sellPrice / buyPrice : 1;
    const feesInSell =
      buyFee * buyToSellFactor +            // 매수 수수료 환산
      sellFee +                             // 매도 수수료
      networkFeeInBuy * buyToSellFactor;    // 네트워크 수수료 환산

    const totalFeeInTarget =
      enableFxAfterCoin && sellCurrency !== targetCurrency
        ? feesInSell * effViaToTargetRate
        : feesInSell;

    // ----- 6) 응답 -----
    const nowIso = new Date().toISOString();
    const payload: QuoteResponse = {
      inputs: { ...body, timestamp: nowIso },
      fx: {
        baseToViaRate: Number(baseToViaRate.toFixed(6)),          // Base → ViaBefore
        viaToTargetRate: Number(viaToTargetRate.toFixed(6)),      // ViaAfter → Target
        effBaseToViaRate: Number(effBaseToViaRate.toFixed(6)),
        effViaToTargetRate: Number(effViaToTargetRate.toFixed(6)),
        asOf: nowIso,
      },
      coin: {
        symbol: stableSymbol,
        priceInViaFiat: Number(buyPrice.toFixed(6)), // 참고용(매수 통화 단가)
        asOf: nowIso,
        exchange: "UPBIT",
        market: `KRW-${stableSymbol}`,
      },
      fees: {
        fxSpreadPct,
        tradePct,
        networkFixedInCoin,
        tradeFeeBuyInVia: Number(buyFee.toFixed(6)),       // buy 통화
        tradeFeeSellInVia: Number(sellFee.toFixed(6)),     // sell 통화
        networkFeeInVia: Number(networkFeeInBuy.toFixed(6)), // buy 통화
        totalFeeInTarget: Number(totalFeeInTarget.toFixed(6)),
      },
      totals: {
        baseAmount: Number(baseAmount.toFixed(6)),               // base 통화
        viaAfterFx1: Number(cashForBuy.toFixed(6)),              // buy 통화
        coinAmount: Number(coinAmount.toFixed(6)),
        coinAfterNetwork: Number(coinAfterNetwork.toFixed(6)),
        viaAfterSell: Number(cashAfterSell.toFixed(6)),          // sell 통화
        finalTargetAmount: Number(finalTargetAmount.toFixed(6)), // target 통화
      },
      hooks: {
        riskAdjustmentApplied: enableCoinAlgo,
        notes: [
          ...algoResult.notes,
          !enableFxBeforeCoin && baseCurrency !== viaFiatBefore
            ? "enableFxBeforeCoin=false: 환전1 생략 → 매수 통화는 baseCurrency로 계산."
            : "",
          !enableFxAfterCoin && viaFiatAfter !== targetCurrency
            ? "enableFxAfterCoin=false: 환전2 생략 → 최종 금액은 sellCurrency(=viaAfter 또는 target) 단위."
            : "",
        ].filter(Boolean),
      },
    };

    return NextResponse.json(payload);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[/api/quote] error:", msg);
    return NextResponse.json(
      { error: "Internal error generating quote.", reason: msg },
      { status: 500 }
    );
  }
}
