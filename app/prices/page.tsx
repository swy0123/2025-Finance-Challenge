"use client";
import { useEffect, useState } from "react";

export default function PricesPage() {
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    fetch("/api/price")
      .then(res => res.json())
      .then(setData);
  }, []);

  return (
    <div style={{ padding: 20 }}>
      <h1>코인 시세</h1>
      {data ? <pre>{JSON.stringify(data, null, 2)}</pre> : "로딩 중..."}
    </div>
  );
}
