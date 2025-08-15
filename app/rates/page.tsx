"use client";
import { useEffect, useState } from "react";
import type { RateApiResponse } from "@/types/api";

export default function RatesPage() {
  const [data, setData] = useState<RateApiResponse | null>(null);

  useEffect(() => {
    fetch("/api/rate")
      .then(res => res.json())
      .then(setData);
  }, []);

  return (
    <div style={{ padding: 20 }}>
      <h1>환율</h1>
      {data ? <p>1 USD = {data.rate} KRW</p> : "로딩 중..."}
    </div>
  );
}
