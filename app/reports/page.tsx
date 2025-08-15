"use client";
import { useState } from "react";
import type { ReportApiResponse } from "@/types/api";

export default function ReportsPage() {
  const [query, setQuery] = useState("비트코인 전망");
  const [data, setData] = useState<ReportApiResponse | null>(null);

  const getReport = async () => {
    const res = await fetch(`/api/report?query=${encodeURIComponent(query)}`);
    const json = await res.json();
    setData(json);
  };

  return (
    <div style={{ padding: 20 }}>
      <h1>분석 보고서</h1>
      <input value={query} onChange={e => setQuery(e.target.value)} />
      <button onClick={getReport}>보고서 생성</button>

      {data && (
        <>
          <h2>검색 요약</h2>
          <p>{data.searchSummary}</p>
          <h2>Gemini 분석</h2>
          <p>{data.analysis}</p>
        </>
      )}
    </div>
  );
}
