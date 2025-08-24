"use client";
import { useRef, useState } from "react";
import type {
  Currency,
  StableSymbol,
  QuoteRequest,
  QuoteResponse,
  ReportApiResponse,
  CoinAlgoName,
} from "@/types/api";

const currencies: Currency[] = ["KRW", "USD"];
const stables: StableSymbol[] = ["USDT", "USDC"];
const algoOptions: CoinAlgoName[] = ["NONE", "AAAA"];

// 런타임 타입 가드
function hasTotals(x: any): x is QuoteResponse {
  return x && typeof x === "object" && x.totals && typeof x.totals.finalTargetAmount === "number";
}

export default function TransferPage() {
  // ===== 입력 상태 =====
  const [baseCurrency, setBaseCurrency] = useState<Currency>("KRW");
  const [viaFiat, setViaFiat] = useState<Currency>("USD");
  const [stableSymbol, setStableSymbol] = useState<StableSymbol>("USDT");
  const [targetCurrency, setTargetCurrency] = useState<Currency>("KRW");

  // 단계 옵션
  const [enableFxBeforeCoin, setEnableFxBeforeCoin] = useState<boolean>(true);
  const [enableFxAfterCoin, setEnableFxAfterCoin] = useState<boolean>(true);
  const [enableCoinAlgo, setEnableCoinAlgo] = useState<boolean>(false);
  const [coinAlgoName, setCoinAlgoName] = useState<CoinAlgoName>("NONE");

  // 금액/수수료
  const [amount, setAmount] = useState<number>(1000000);
  const [fxSpreadPct, setFxSpreadPct] = useState<number>(0.3);
  const [tradePct, setTradePct] = useState<number>(0.05);
  const [networkFixedInCoin, setNetworkFixedInCoin] = useState<number>(1);

  // ===== 결과/상태 =====
  const [quote, setQuote] = useState<QuoteResponse | null>(null);
  const [geminiReport, setGeminiReport] = useState<ReportApiResponse | null>(null);
  const [trendsText, setTrendsText] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Dialog
  const trendsDialogRef = useRef<HTMLDialogElement | null>(null);
  const openTrendsDialog = () => trendsDialogRef.current?.showModal();
  const closeTrendsDialog = () => trendsDialogRef.current?.close();

  // ===== 액션 =====
  const handleQuote = async () => {
    setLoading(true);
    setGeminiReport(null);
    setErrorMsg(null);
    setQuote(null);
    try {
      const body: QuoteRequest = {
        amount,
        baseCurrency,
        viaFiat,
        stableSymbol,
        targetCurrency,
        enableFxBeforeCoin,
        enableFxAfterCoin,
        enableCoinAlgo,
        coinAlgoName,
        fee: { fxSpreadPct, tradePct, networkFixedInCoin },
      };
      const res = await fetch("/api/quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok || data?.error) { setErrorMsg(data?.error ?? "견적 계산 중 오류가 발생했습니다."); return; }
      if (!hasTotals(data)) { setErrorMsg("응답 형식이 예상과 다릅니다 (totals 누락)."); return; }
      setQuote(data);
    } catch {
      setErrorMsg("네트워크 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  const handleGeminiReport = async () => {
    if (!quote) return;
    setLoading(true);
    setErrorMsg(null);
    setGeminiReport(null);
    try {
      const res = await fetch("/api/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: "스테이블코인 송금/거래 분석", quote }),
      });
      const data = await res.json();
      if (!res.ok || data?.error) { setErrorMsg(data?.error ?? "보고서 생성 중 오류가 발생했습니다."); return; }
      setGeminiReport(data);
    } catch {
      setErrorMsg("네트워크 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  const handleTrends = async () => {
    setLoading(true);
    setErrorMsg(null);
    setTrendsText("");
    try {
      const query = [
        "stablecoin",
        stableSymbol,
        `${baseCurrency}-${viaFiat}-${targetCurrency}`,
        enableFxBeforeCoin ? "fx_before:on" : "fx_before:off",
        enableFxAfterCoin ? "fx_after:on" : "fx_after:off",
        enableCoinAlgo ? `coin_algo:${coinAlgoName}` : "coin_algo:off",
        "liquidity regulation remittance",
      ].join(" ");
      const res = await fetch("/api/trends", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
      });
      const data = await res.json();
      if (!res.ok || data?.error) { setErrorMsg(data?.error ?? "최신 동향 보고서 생성 중 오류가 발생했습니다."); return; }
      setTrendsText(String(data?.text ?? ""));
      openTrendsDialog();
    } catch {
      setErrorMsg("네트워크 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  // ===== 다크 토큰 =====
  const text = "var(--text)";
  const sub = "var(--sub)";
  const border = "var(--border)";
  const borderStrong = "var(--border-strong)";
  const panel = "var(--panel)";
  const inputBg = "var(--input-bg)";

  const baseInputStyle: React.CSSProperties = {
    width: "100%",
    boxSizing: "border-box",
    background: inputBg,
    color: text as any,
    border: `1px solid ${border}`,
    borderRadius: 10,
    padding: "10px 12px",
    outline: "none",
  };

  const btn = "button";
  const btnAlt1 = "button btn-alt-1";
  const btnAlt2 = "button btn-alt-2";

  const finalUnit = quote?.inputs?.targetCurrency ?? targetCurrency;

  return (
    <div style={{ padding: 20, maxWidth: 1100, margin: "0 auto", minHeight: "100dvh" }}>
      <h1 style={{ marginBottom: 16, letterSpacing: 0.3 }}>스테이블 코인 송금/거래 시뮬레이터</h1>

      <div className="card">
        {/* 1) 타임라인 */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 10 }}>
          <Chip label="환전1 (Base→Via)" value={`${baseCurrency} → ${viaFiat}`} on={enableFxBeforeCoin} />
          <Arrow />
          <Chip
            label="코인"
            value={stableSymbol}
            on
            badge={{ label: (enableCoinAlgo ? coinAlgoName : "ALGO"), active: enableCoinAlgo }}
          />
          <Arrow />
          <Chip label="환전2 (Via→Target)" value={`${viaFiat} → ${targetCurrency}`} on={enableFxAfterCoin} />
        </div>

        {/* 2) 단계 토글 + 알고리즘 선택 */}
        <div style={{ display: "flex", gap: 16, alignItems: "center", marginBottom: 8, flexWrap: "wrap" }}>
          <label style={{ display: "inline-flex", alignItems: "center", gap: 8, color: sub as any }}>
            <input type="checkbox" checked={enableFxBeforeCoin} onChange={(e) => setEnableFxBeforeCoin(e.target.checked)} />
            환전1 사용(Base→Via)
          </label>
          <label style={{ display: "inline-flex", alignItems: "center", gap: 8, color: sub as any }}>
            <input type="checkbox" checked={enableFxAfterCoin} onChange={(e) => setEnableFxAfterCoin(e.target.checked)} />
            환전2 사용(Via→Target)
          </label>
          <label style={{ display: "inline-flex", alignItems: "center", gap: 8, color: sub as any }}>
            <input type="checkbox" checked={enableCoinAlgo} onChange={(e) => setEnableCoinAlgo(e.target.checked)} />
            코인 알고리즘 적용
          </label>
          <div style={{ width: 180 }}>
            <select
              value={coinAlgoName}
              onChange={(e) => setCoinAlgoName(e.target.value as CoinAlgoName)}
              style={baseInputStyle}
              disabled={!enableCoinAlgo}
              title="알고리즘 선택"
            >
              {algoOptions.map((opt) => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
          </div>
        </div>

        {/* 3) 드롭다운 */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 12, marginBottom: 12 }}>
          <Field label="보내는 통화 (Base)">
            <select value={baseCurrency} onChange={(e) => setBaseCurrency(e.target.value as Currency)} style={baseInputStyle}>
              {currencies.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </Field>
          <Field label="중간 환전 (Via)">
            <select value={viaFiat} onChange={(e) => setViaFiat(e.target.value as Currency)} style={baseInputStyle}>
              {currencies.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </Field>
          <Field label="스테이블 코인">
            <select value={stableSymbol} onChange={(e) => setStableSymbol(e.target.value as StableSymbol)} style={baseInputStyle}>
              {stables.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </Field>
          <Field label="받는 통화 (Target)">
            <select value={targetCurrency} onChange={(e) => setTargetCurrency(e.target.value as Currency)} style={baseInputStyle}>
              {currencies.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </Field>
        </div>

        {/* 4) 금액/수수료 */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 12, marginBottom: 12 }}>
          <Field label={`보낼 금액 (${baseCurrency})`}>
            <input type="number" value={amount} onChange={(e) => setAmount(Number(e.target.value))} style={baseInputStyle} />
          </Field>
          <Field label="환전 스프레드(%)">
            <input type="number" step="0.01" value={fxSpreadPct} onChange={(e) => setFxSpreadPct(Number(e.target.value))} style={baseInputStyle} />
          </Field>
          <Field label="거래 수수료(%)">
            <input type="number" step="0.01" value={tradePct} onChange={(e) => setTradePct(Number(e.target.value))} style={baseInputStyle} />
          </Field>
          <Field label="네트워크 수수료(코인수량)">
            <input type="number" step="0.01" value={networkFixedInCoin} onChange={(e) => setNetworkFixedInCoin(Number(e.target.value))} style={baseInputStyle} />
          </Field>
        </div>

        {/* 5) 액션 버튼 */}
        <div style={{ display: "flex", gap: 10, marginBottom: 8, flexWrap: "wrap" }}>
          <button onClick={handleQuote} disabled={loading} className={btn}>견적 계산</button>
          <button onClick={handleGeminiReport} disabled={!quote || loading} className={btnAlt1}>Gemini 분석 보고서</button>
          <button onClick={handleTrends} disabled={loading} className={btnAlt2}>최신 동향 보고서 (Perplexity)</button>
        </div>

        {/* 에러 */}
        {errorMsg && (
          <p className="text-danger" style={{ marginBottom: 8, padding: "6px 8px", background: "#201317", borderRadius: 8 }}>
            {errorMsg}
          </p>
        )}

        {/* 6) 결과 */}
        {quote && hasTotals(quote) && (
          <div style={{ marginTop: 8, marginBottom: 6, lineHeight: 1.7, background: inputBg, border: `1px solid ${border}`, borderRadius: 12, padding: 12 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <Stat label={`최종 수취액 (${finalUnit})`} value={`${quote.totals.finalTargetAmount}`} />
              <Stat label={`총 수수료 (${finalUnit})`} value={`${quote.fees.totalFeeInTarget}`} />
            </div>
            {quote.hooks?.notes?.length ? (
              <div style={{ marginTop: 8, color: sub as any, fontSize: 12 }}>
                {quote.hooks.notes.map((n, i) => <div key={i}>• {n}</div>)}
              </div>
            ) : null}
          </div>
        )}

        {/* Gemini 요약 */}
        {geminiReport && (
          <div style={{ padding: 12, background: inputBg, border: `1px solid ${border}`, borderRadius: 12, marginTop: 8, lineHeight: 1.7 }}>
            <h3 style={{ marginTop: 0 }}>Gemini 분석 요약</h3>
            <div style={{ whiteSpace: "pre-wrap", color: sub as any }}>{geminiReport.analysis}</div>
          </div>
        )}
      </div>

      {/* Perplexity 다이얼로그 */}
      <dialog
        ref={trendsDialogRef}
        style={{
          maxWidth: 820,
          width: "90%",
          border: `1px solid ${borderStrong}`,
          borderRadius: 16,
          padding: 0,
          background: panel as any,
          color: text as any,
        }}
      >
        <form method="dialog" style={{ margin: 0 }}>
          <div style={{ padding: 16, borderBottom: `1px solid ${border}`, background: "#0f1320", borderTopLeftRadius: 16, borderTopRightRadius: 16 }}>
            <h3 style={{ margin: 0 }}>최신 동향 보고서</h3>
          </div>
          <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.7, padding: 16, color: sub as any }}>
            {trendsText}
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", padding: 12, gap: 8 }}>
            <button className={btn} onClick={closeTrendsDialog} style={{ padding: "8px 14px" }}>
              닫기
            </button>
          </div>
        </form>
      </dialog>
    </div>
  );
}

/** 소품들 */
function Chip({
  label,
  value,
  on,
  badge,
}: {
  label: string;
  value: string;
  on?: boolean;
  badge?: { label: string; active: boolean };
}) {
  return (
    <div className="chip" style={{ background: "var(--chip)" }}>
      <span className="sub">{label}</span>
      <strong>{value}</strong>
      <span
        style={{
          marginLeft: 8,
          fontSize: 11,
          padding: "2px 8px",
          borderRadius: 999,
          border: `1px solid var(--border)`,
          background: on ? "rgba(106,169,255,0.18)" : "rgba(255,255,255,0.06)",
        }}
      >
        {on ? "ON" : "OFF"}
      </span>
      {badge && (
        <span
          style={{
            marginLeft: 6,
            fontSize: 11,
            padding: "2px 8px",
            borderRadius: 999,
            border: `1px solid var(--border)`,
            background: badge.active ? "rgba(90,200,120,0.22)" : "rgba(255,255,255,0.06)",
          }}
          title={badge.label}
        >
          {badge.label}{badge.active ? "" : ""}
        </span>
      )}
    </div>
  );
}
function Arrow() { return <span style={{ opacity: 0.6, color: "var(--sub)" }}>→</span>; }
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "grid", gap: 6 }}>
      <span className="text-sub" style={{ fontSize: 12 }}>{label}</span>
      {children}
    </label>
  );
}
function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="stat">
      <span className="label">{label}</span>
      <strong className="value">{value}</strong>
    </div>
  );
}
