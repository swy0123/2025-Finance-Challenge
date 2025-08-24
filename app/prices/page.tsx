"use client";

import { useEffect, useState } from "react";
import type { PriceApiResponse, StableSymbol } from "@/types/api";

const stables: StableSymbol[] = ["USDT", "USDC"];
const markets = ["KRW"]; // 업비트 기준 KRW 마켓 우선

export default function PricesPage() {
  const [symbol, setSymbol] = useState<StableSymbol>("USDT");
  const [market, setMarket] = useState<string>("KRW");

  const [data, setData] = useState<PriceApiResponse | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchPrice = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/price?symbol=${symbol}&market=${market}`, {
        cache: "no-store",
      });
      const json = await res.json();
      setData(json);
    } catch (e) {
      console.error("price fetch error:", e);
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPrice();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol, market]);

  return (
    <div style={{ padding: 20 }}>
      <h1>코인 시세</h1>

      {/* 컨트롤 */}
      <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 12 }}>
        <label>
          코인&nbsp;
          <select value={symbol} onChange={(e) => setSymbol(e.target.value as StableSymbol)}>
            {stables.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>

        <label>
          마켓&nbsp;
          <select value={market} onChange={(e) => setMarket(e.target.value)}>
            {markets.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </label>

        <button onClick={fetchPrice} disabled={loading}>
          새로고침
        </button>
      </div>

      {/* 결과: 수치만 간결 출력 */}
      {loading && <p>불러오는 중...</p>}
      {!loading && data && !("error" in data) && (
        <div style={{ lineHeight: 1.7 }}>
          <div>거래소: {data.exchange}</div>
          <div>마켓: {data.market}</div>
          <div>
            현재가: <strong>{data.price}</strong> {market}
          </div>
          <div>기준시각: {new Date(data.asOf).toLocaleString()}</div>
        </div>
      )}

      {!loading && (!data || "error" in (data as any)) && (
        <p style={{ color: "crimson" }}>시세를 불러오지 못했습니다.</p>
      )}
    </div>
  );
}
