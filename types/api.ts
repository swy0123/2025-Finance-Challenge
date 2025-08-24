// types/api.ts

/** 통화 코드 (MVP: KRW, USD만 사용) */
export type Currency = "KRW" | "USD";

/** 스테이블 코인 심볼 */
export type StableSymbol = "USDT" | "USDC";

/** 코인 단계 알고리즘 이름 */
export type CoinAlgoName = "NONE" | "AAAA";

/** /api/rate 응답 타입 */
export interface RateApiResponse {
  base: Currency;
  quote: Currency;
  rate: number;   // 1 base = rate quote
  asOf: string;   // ISO
}

/** /api/price 응답 타입 */
export interface PriceApiResponse {
  symbol: StableSymbol;
  market: string;          // 예: "KRW-USDT"
  price: number;           // 1 코인 가격 (market 기준 통화)
  exchange: "UPBIT";
  asOf: string;            // ISO
}

/** /api/report 응답 타입 (LLM 요약) */
export interface ReportApiResponse {
  searchSummary: string;
  analysis: string;
}

/** /api/quote 요청 타입 */
export interface QuoteRequest {
  amount: number;
  baseCurrency: Currency;        // 예: "KRW"
  viaFiat: Currency;             // 예: "USD"
  stableSymbol: StableSymbol;    // 예: "USDT"
  targetCurrency: Currency;      // 예: "KRW"

  /** 환전 단계 옵션 */
  enableFxBeforeCoin?: boolean;  // default: true (base -> via)
  enableFxAfterCoin?: boolean;   // default: true (via -> target)

  /** 코인 단계 알고리즘 옵션 */
  enableCoinAlgo?: boolean;      // default: false
  coinAlgoName?: CoinAlgoName;   // default: "NONE"

  fee?: {
    fxSpreadPct?: number;        // 환전 스프레드(%)
    tradePct?: number;           // 거래소 매수/매도 수수료(%)
    networkFixedInCoin?: number; // 네트워크 수수료(코인 수량)
  };
}

/** /api/quote 응답 타입 (간결한 수치 위주) */
export interface QuoteResponse {
  inputs: QuoteRequest & { timestamp: string };

  fx: {
    baseToViaRate: number;
    viaToTargetRate: number;
    effBaseToViaRate: number;
    effViaToTargetRate: number;
    asOf: string;
  };

  /** viaFiat 기준 단가가 아니라 '매수 통화' 기준 단가로 채워둠(참고용) */
  coin: {
    symbol: StableSymbol;
    priceInViaFiat: number; // 실제로는 buy 통화 기준 단가
    asOf: string;
    exchange: "UPBIT";
    market: string;         // 예: "KRW-USDT"
  };

  fees: {
    fxSpreadPct: number;
    tradePct: number;
    networkFixedInCoin: number;

    tradeFeeBuyInVia: number;   // 매수 수수료 (buy 통화)
    tradeFeeSellInVia: number;  // 매도 수수료 (sell 통화)
    networkFeeInVia: number;    // 네트워크 수수료 (buy 통화)
    totalFeeInTarget: number;   // 총수수료 (최종 통화)
  };

  totals: {
    baseAmount: number;         // base 통화
    viaAfterFx1: number;        // 환전1 후 매수 투입액 (buy 통화)
    coinAmount: number;         // 네트워크 차감 전 코인 수량
    coinAfterNetwork: number;   // 네트워크 차감 후 코인 수량
    viaAfterSell: number;       // 매도 후 현금 (sell 통화)
    finalTargetAmount: number;  // 최종 수취 금액 (최종 통화)
    pnlVsBaseInTarget?: number;
  };

  hooks: {
    riskAdjustmentApplied: boolean; // = enableCoinAlgo
    notes: string[];
  };
}
