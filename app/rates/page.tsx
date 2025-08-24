"use client";

import { useEffect, useState } from "react";
import type { RateApiResponse, Currency } from "@/types/api";

const currencies: Currency[] = ["KRW", "USD"];

export default function RatesPage() {
  const [base, setBase] = useState<Currency>("USD");
  const [quote, setQuote] = useState<Currency>("KRW");

  const [data, setData] = useState<RateApiResponse | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchRate = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/rate?base=${base}&quote=${quote}`, {
        cache: "no-store",
      });
      const json = await res.json();
      setData(json);
    } catch (e) {
      console.error("rate fetch error:", e);
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base, quote]);

  return (
    <div style={{ padding: 20 }}>
      <h1>환율</h1>

      {/* 컨트롤 */}
      <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 12 }}>
        <label>
          Base&nbsp;
          <select value={base} onChange={(e) => setBase(e.target.value as Currency)}>
            {currencies.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>

        <label>
          Quote&nbsp;
          <select value={quote} onChange={(e) => setQuote(e.target.value as Currency)}>
            {currencies.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>

        <button onClick={fetchRate} disabled={loading}>
          새로고침
        </button>
      </div>

      {/* 결과 */}
      {loading && <p>불러오는 중...</p>}
      {!loading && data && !("error" in data) && (
        <div style={{ lineHeight: 1.7 }}>
          <div>
            1 {data.base} = <strong>{data.rate}</strong> {data.quote}
          </div>
          <div>기준시각: {new Date(data.asOf).toLocaleString()}</div>
        </div>
      )}
      {!loading && (!data || "error" in (data)) && (
        <p style={{ color: "crimson" }}>환율을 불러오지 못했습니다.</p>
      )}
    </div>
  );
}
