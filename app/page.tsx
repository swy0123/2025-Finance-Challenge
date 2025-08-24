// app/page.tsx
export default function HomePage() {
  return (
    <div style={{ padding: 20 }}>
      <h1>Crypto Dashboard</h1>
      <ul>
        <li><a href="/transfer">스테이블 코인 송금/거래 시뮬레이터</a></li>
        <li><a href="/prices">코인 시세</a></li>
        <li><a href="/rates">환율</a></li>
        <li><a href="/reports">분석 보고서</a></li>
      </ul>
    </div>
  );
}
