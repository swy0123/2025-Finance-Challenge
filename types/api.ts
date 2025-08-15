// /types/api.ts
export interface PriceApiResponse {
  symbol: string;          // 예: "KRW-BTC"
  price: number | null;    // 업비트에서 못 받으면 null
}

export interface RateApiResponse {
  from: string;            // 예: "USD"
  to: string;              // 예: "KRW"
  rate: number | null;
}

export interface ReportApiResponse {
  success: boolean;
  query: string;           // 검색어
  searchSummary: string;   // Perplexity 요약
  analysis: string;        // Gemini 요약/분석
}
