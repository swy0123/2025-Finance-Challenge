"use client";

import { useState } from "react";
import type { ReportApiResponse } from "@/types/api";

/**
 * 간단 보고서 페이지 (입력 → Gemini 분석 호출)
 * - 최소 UI: 쿼리 입력 + 버튼 + 결과 텍스트
 * - /api/report 에 query만 전달 (quote는 선택)
 */
export default function ReportsPage() {
  const [query, setQuery] = useState("스테이블코인 송금/거래 분석");
  const [rawQuote, setRawQuote] = useState<string>(""); // 선택: /api/quote 결과 JSON을 붙여넣어 전송
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<ReportApiResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleReport = async () => {
    setLoading(true);
    setError(null);
    setData(null);

    let quote = undefined;
    if (rawQuote.trim()) {
      try {
        quote = JSON.parse(rawQuote);
      } catch {
        setError("quote JSON을 올바르게 입력해 주세요.");
        setLoading(false);
        return;
      }
    }

    try {
      const res = await fetch("/api/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, quote }),
      });
      const json = await res.json();
      if (!res.ok || json.error) {
        setError(json.error ?? "보고서 생성 중 오류가 발생했습니다.");
      } else {
        setData(json);
      }
    } catch (e) {
      setError("네트워크 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: 20 }}>
      <h1>분석 보고서</h1>

      <div style={{ display: "grid", gap: 8, maxWidth: 720 }}>
        <label>
          분석 주제
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{ width: "100%", boxSizing: "border-box" }}
          />
        </label>

        <label>
          (선택) 견적 JSON (/api/quote 결과 붙여넣기)
          <textarea
            rows={6}
            placeholder='{"totals": {...}, "fees": {...}, ...}'
            value={rawQuote}
            onChange={(e) => setRawQuote(e.target.value)}
            style={{ width: "100%", boxSizing: "border-box", fontFamily: "monospace" }}
          />
        </label>

        <div>
          <button onClick={handleReport} disabled={loading}>
            {loading ? "생성 중..." : "보고서 생성"}
          </button>
        </div>
      </div>

      {error && <p style={{ color: "crimson", marginTop: 12 }}>{error}</p>}

      {data && (
        <div style={{ marginTop: 20, lineHeight: 1.7 }}>
          <h2>결과</h2>
          <div style={{ whiteSpace: "pre-wrap" }}>{data.analysis}</div>
        </div>
      )}
    </div>
  );
}
