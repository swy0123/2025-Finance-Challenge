"use client";
import { useEffect, useState } from "react";

export default function RatesPage() {
  const [data, setData] = useState<any>(null);

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
