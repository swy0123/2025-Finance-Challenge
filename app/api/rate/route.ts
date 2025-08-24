// app/api/rate/route.ts
import { NextResponse } from "next/server";
import type { RateApiResponse, Currency } from "@/types/api";
import { Agent as UndiciAgent } from "undici";

/**
 * USD ↔ KRW 환율 API (MVP)
 * 우선순위:
 *   1) 한국수출입은행(Exim) - KOREAEXIM_API_KEY가 있을 때
 *   2) 환경변수 EXCHANGE_RATE_API_URL (예: https://open.er-api.com/v6/latest/USD)
 *   3) exchangerate.host (무료 공개)
 *
 * 로컬 TLS 문제 시:
 *   EXIM_TLS_INSECURE=1  → undici로 rejectUnauthorized:false
 */

const EXIM_KEY = process.env.KOREAEXIM_API_KEY;
const EXTERNAL_RATE_URL = process.env.EXCHANGE_RATE_API_URL || ""; // base=USD 기준 URL 기대
const TLS_INSECURE = process.env.EXIM_TLS_INSECURE === "1";

const dispatcher = TLS_INSECURE
  ? new UndiciAgent({ connect: { rejectUnauthorized: false } })
  : undefined;

/** 'YYYYMMDD' */
function yyyymmdd(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

async function fetchJson(url: string, revalidateSec = 60) {
  const res = await fetch(url, {
    next: { revalidate: revalidateSec },
    ...(dispatcher ? { dispatcher } : {}),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

/** 1) Exim: host 후보 2개(oapi, www) 순차 시도 */
async function fetchEximUsdKrw(dateStr: string): Promise<number | null> {
  if (!EXIM_KEY) return null;
  const candidates = [
    `https://oapi.koreaexim.go.kr/site/program/financial/exchangeJSON?authkey=${EXIM_KEY}&searchdate=${dateStr}&data=AP01`,
    `https://www.koreaexim.go.kr/site/program/financial/exchangeJSON?authkey=${EXIM_KEY}&searchdate=${dateStr}&data=AP01`,
  ];
  for (const url of candidates) {
    try {
      const data = (await fetchJson(url)) as any[];
      if (!Array.isArray(data)) continue;
      const usd = data.find((row) => row.cur_unit === "USD");
      if (!usd) continue;
      const krwPerUsd = Number(String(usd.deal_bas_r ?? "").replace(/,/g, ""));
      if (Number.isFinite(krwPerUsd)) return krwPerUsd;
    } catch {
      // 다음 후보
    }
  }
  return null;
}

/** 2) 환경변수 EXCHANGE_RATE_API_URL:
 *    - 예: https://open.er-api.com/v6/latest/USD  → { rates: { KRW: ... } }
 */
async function fetchEnvUsdKrw(): Promise<number | null> {
  if (!EXTERNAL_RATE_URL) return null;
  try {
    const data = (await fetchJson(EXTERNAL_RATE_URL, 30)) as any;
    // open.er-api.com 구조: { result: "success", rates: { KRW: number }, ... }
    const rate = data?.rates?.KRW ?? data?.KRW; // 혹시 다른 구조를 대비
    return Number.isFinite(rate) ? rate : null;
  } catch {
    return null;
  }
}

/** 3) 공개 대체 소스 */
async function fetchFallbackUsdKrw(): Promise<number | null> {
  try {
    const data = (await fetchJson(
      "https://api.exchangerate.host/latest?base=USD&symbols=KRW",
      30
    )) as any;
    const rate = data?.rates?.KRW;
    return Number.isFinite(rate) ? rate : null;
  } catch {
    return null;
  }
}

async function getUsdKrw(): Promise<{ rate: number; asOf: string } | null> {
  // 1) Exim(최근 7일 역순) 시도
  if (EXIM_KEY) {
    const today = new Date();
    for (let i = 0; i < 7; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const ds = yyyymmdd(d);
      const r = await fetchEximUsdKrw(ds);
      if (r) return { rate: r, asOf: new Date(d).toISOString() };
    }
  }
  // 2) ENV URL
  const envRate = await fetchEnvUsdKrw();
  if (envRate) return { rate: envRate, asOf: new Date().toISOString() };

  // 3) Fallback
  const fb = await fetchFallbackUsdKrw();
  if (fb) return { rate: fb, asOf: new Date().toISOString() };

  return null;
}

function hardFallback(): { rate: number; asOf: string } {
  // 최후 임시값 (배포 전 교체 권장)
  return { rate: 1350, asOf: new Date().toISOString() };
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const base = (searchParams.get("base") || "USD").toUpperCase() as Currency;
    const quote = (searchParams.get("quote") || "KRW").toUpperCase() as Currency;

    if (base === quote) {
      const payload: RateApiResponse = {
        base,
        quote,
        rate: 1,
        asOf: new Date().toISOString(),
      };
      return NextResponse.json(payload);
    }

    const supported = new Set<Currency>(["USD", "KRW"]);
    if (!supported.has(base) || !supported.has(quote)) {
      return NextResponse.json(
        { error: "MVP는 USD와 KRW만 지원합니다." },
        { status: 400 }
      );
    }

    const usdkrw = (await getUsdKrw()) ?? hardFallback();

    // 변환
    let rate: number;
    if (base === "USD" && quote === "KRW") {
      rate = usdkrw.rate; // 1 USD = X KRW
    } else if (base === "KRW" && quote === "USD") {
      rate = 1 / usdkrw.rate; // 1 KRW = X USD
    } else {
      return NextResponse.json({ error: "Unsupported currency pair." }, { status: 400 });
    }

    const payload: RateApiResponse = {
      base,
      quote,
      rate: Number(rate.toFixed(6)),
      asOf: usdkrw.asOf,
    };
    return NextResponse.json(payload);
  } catch (err) {
    console.error("[/api/rate] error:", err);
    return NextResponse.json(
      { error: "Internal error fetching rate." },
      { status: 500 }
    );
  }
}
