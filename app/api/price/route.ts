// app/api/price/route.ts
import { NextResponse } from "next/server";
import type { PriceApiResponse, StableSymbol } from "@/types/api";

/**
 * 업비트 가격 조회 API
 * - GET /api/price?symbol=USDT&market=KRW
 *
 * 업비트 마켓 규칙:
 *   "<기준통화>-<종목>" 형식
 *   예: KRW-USDT, KRW-USDC
 */

const UPBIT_BASE = process.env.UPBIT_BASE_URL || "https://api.upbit.com/v1";

async function fetchUpbitTicker(market: string) {
  const url = `${UPBIT_BASE}/ticker?markets=${market}`;
  const res = await fetch(url, { next: { revalidate: 5 } });
  if (!res.ok) {
    throw new Error(`Upbit fetch failed for ${market}: ${res.status}`);
  }
  const data = await res.json();
  if (!Array.isArray(data) || data.length === 0) {
    throw new Error(`Upbit ticker empty for ${market}`);
  }
  return data[0];
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const symbol = (searchParams.get("symbol") || "USDT").toUpperCase() as StableSymbol;
    const marketCurrency = (searchParams.get("market") || "KRW").toUpperCase();

    // ✅ 업비트 규격: "<기준통화>-<종목>"
    const upbitMarket = `${marketCurrency}-${symbol}`;

    const ticker = await fetchUpbitTicker(upbitMarket);

    const payload: PriceApiResponse = {
      symbol,
      market: upbitMarket,
      price: Number(ticker.trade_price),
      exchange: "UPBIT",
      asOf: new Date(ticker.timestamp).toISOString(),
    };

    return NextResponse.json(payload);
  } catch (err) {
  const msg = err instanceof Error ? err.message : String(err);
    console.error("[/api/price] error:", msg);
    return NextResponse.json(
      { error: "Failed to fetch price from Upbit." },
      { status: 500 }
    );
  }
}
