"use client";
import { useRef, useState } from "react";
import type {
  Currency,
  StableSymbol,
  QuoteRequest,
  QuoteResponse,
  CoinAlgoName,
  ReportStage,
} from "@/types/api";

/** CSS 변수 토큰 */
const CSSVARS = {
  text: "var(--text)" as const,
  sub: "var(--sub)" as const,
  border: "var(--border)" as const,
  borderStrong: "var(--border-strong)" as const,
  panel: "var(--panel)" as const,
  inputBg: "var(--input-bg)" as const,
};

const currencies: Currency[] = ["KRW", "USD"];
const stables: StableSymbol[] = ["USDT", "USDC"];
const algoOptions: CoinAlgoName[] = ["NONE", "AAAA"];

/** 런타임 타입 가드들 */
type ApiError = { error: string; reason?: string };
function isApiError(x: unknown): x is ApiError {
  if (typeof x !== "object" || x === null) return false;
  const o = x as { error?: unknown };
  return typeof o.error === "string";
}
function hasTotals(x: unknown): x is QuoteResponse {
  if (typeof x !== "object" || x === null) return false;
  const o = x as { totals?: unknown };
  if (typeof o.totals !== "object" || o.totals === null) return false;
  const t = (o.totals as { finalTargetAmount?: unknown }).finalTargetAmount;
  return typeof t === "number";
}

export default function TransferPage() {
  // ===== 입력 상태 =====
  const [baseCurrency, setBaseCurrency] = useState<Currency>("KRW");
  const [viaFiatBefore, setViaFiatBefore] = useState<Currency>("USD");
  const [viaFiatAfter, setViaFiatAfter] = useState<Currency>("USD");
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

  const [trendsText, setTrendsText] = useState<string>("");
  const [trendsStage, setTrendsStage] = useState<ReportStage | null>(null);

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Dialog
  const trendsDialogRef = useRef<HTMLDialogElement | null>(null);
  const openTrendsDialog = () => trendsDialogRef.current?.showModal();
  const closeTrendsDialog = () => trendsDialogRef.current?.close();

  // 단계 가시성: 비활성화면 보고서 레이아웃 숨김
  const isStageVisible = (st: ReportStage | null): boolean => {
    if (!st) return true;
    if (st === "coin" || st === "final") return true;
    if (st === "fxBefore") return enableFxBeforeCoin;
    if (st === "fxAfter")  return enableFxAfterCoin;
    return false;
  };

  // ===== 액션 =====
  const handleQuote = async () => {
    setLoading(true);
    setErrorMsg(null);
    setQuote(null);
    setTrendsText("");
    setTrendsStage(null);
    try {
      const body: QuoteRequest = {
        amount,
        baseCurrency,
        viaFiatBefore,
        viaFiatAfter,
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
      const data: unknown = await res.json();
      if (!res.ok || isApiError(data)) {
        setErrorMsg(isApiError(data) ? data.error : "견적 계산 중 오류가 발생했습니다.");
        return;
      }
      if (!hasTotals(data)) {
        setErrorMsg("응답 형식이 예상과 다릅니다 (totals 누락).");
        return;
      }
      setQuote(data);
    } catch {
      setErrorMsg("네트워크 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  // ---------- Perplexity ----------
  const handleTrends = async (stage: ReportStage) => {
    if (!isStageVisible(stage)) {
      setErrorMsg("해당 단계가 비활성화되어 보고서를 생성할 수 없습니다.");
      return;
    }
    setLoading(true);
    setErrorMsg(null);
    setTrendsText("");
    setTrendsStage(null);
    try {
      const baseInfo = `base=${baseCurrency}, viaBefore=${viaFiatBefore}, viaAfter=${viaFiatAfter}, target=${targetCurrency}, coin=${stableSymbol}, fx1=${enableFxBeforeCoin}, fx2=${enableFxAfterCoin}, algo=${enableCoinAlgo ? coinAlgoName : "OFF"}`;
      const q =
        stage === "fxBefore"
          ? `[FX Before] ${baseInfo} | 최근 3일 USD/KRW & 달러지수 테이블 + 사전 환전 타이밍`
          : stage === "coin"
          ? `[COIN] ${baseInfo} | ${stableSymbol} 기본/발행기관/신뢰성 근거 (최근 3일 이슈 중심)`
          : stage === "fxAfter"
          ? `[FX After] ${baseInfo} | 최근 3일 USD/KRW & 달러지수 테이블 + 수취 직전 환전 타이밍`
          : `[FINAL] ${baseInfo} | 최근 3일 지표 반영한 총비용/개선 포인트`;

      const res = await fetch("/api/trends", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage, query: q, quote }),
      });
      const data: unknown = await res.json();
      if (!res.ok || isApiError(data)) {
        setErrorMsg(isApiError(data) ? data.error : "최신 동향 보고서 생성 중 오류가 발생했습니다.");
        return;
      }
      const text = (data as { text?: string }).text ?? "";
      setTrendsText(String(text));
      setTrendsStage(stage);
      openTrendsDialog();
    } catch {
      setErrorMsg("네트워크 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  // ===== 스타일 =====
  const baseInputStyle: React.CSSProperties = {
    width: "100%",
    boxSizing: "border-box",
    background: CSSVARS.inputBg,
    color: CSSVARS.text,
    border: `1px solid ${CSSVARS.border}`,
    borderRadius: 10,
    padding: "10px 12px",
    outline: "none",
  };

  const btn = "button";
  const finalUnit = quote?.inputs?.targetCurrency ?? targetCurrency;

  return (
    <div style={{ padding: 20, maxWidth: 1100, margin: "0 auto", minHeight: "100dvh" }}>
      <h1 style={{ marginBottom: 16, letterSpacing: 0.3 }}>스테이블 코인 송금/거래 시뮬레이터</h1>

      <div className="card">
        {/* 타임라인 */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 10 }}>
          {enableFxBeforeCoin && (
            <>
              <Chip label="환전1 (Base→ViaBefore)" value={`${baseCurrency} → ${viaFiatBefore}`} on={enableFxBeforeCoin} />
              <Arrow />
            </>
          )}
          <Chip
            label="코인"
            value={stableSymbol}
            on
            badge={{ label: enableCoinAlgo ? coinAlgoName : "ALGO", active: enableCoinAlgo }}
          />
          {enableFxAfterCoin && (
            <>
              <Arrow />
              <Chip label="환전2 (ViaAfter→Target)" value={`${viaFiatAfter} → ${targetCurrency}`} on={enableFxAfterCoin} />
            </>
          )}
        </div>

        {/* 단계별 Perplexity 버튼만 */}
        {enableFxBeforeCoin && (
          <ToolbarSingle
            title="환전1(사전) — 최신 동향 (Perplexity)"
            caption="최근 3일 USD/KRW & 달러지수 테이블 + 사전 타이밍"
            onTrends={() => handleTrends("fxBefore")}
          />
        )}

        <ToolbarSingle
          title="코인 단계 — 최신 동향 (Perplexity)"
          caption="발행기관/신뢰성 근거, 최근(3일) 이슈 중심"
          onTrends={() => handleTrends("coin")}
        />

        {enableFxAfterCoin && (
          <ToolbarSingle
            title="환전2(사후) — 최신 동향 (Perplexity)"
            caption="최근 3일 USD/KRW & 달러지수 테이블 + 수취 직전 타이밍"
            onTrends={() => handleTrends("fxAfter")}
          />
        )}

        <ToolbarSingle
          title="최종 — 최신 동향 (Perplexity)"
          caption="3일 지표 반영한 총비용/개선 포인트"
          onTrends={() => handleTrends("final")}
        />

        {/* 단계 토글 */}
        <div style={{ display: "flex", gap: 16, alignItems: "center", margin: "8px 0 8px", flexWrap: "wrap" }}>
          <label style={{ display: "inline-flex", alignItems: "center", gap: 8, color: CSSVARS.sub }}>
            <input type="checkbox" checked={enableFxBeforeCoin} onChange={(e) => setEnableFxBeforeCoin(e.target.checked)} />
            환전1 사용(Base→ViaBefore)
          </label>
          <label style={{ display: "inline-flex", alignItems: "center", gap: 8, color: CSSVARS.sub }}>
            <input type="checkbox" checked={enableFxAfterCoin} onChange={(e) => setEnableFxAfterCoin(e.target.checked)} />
            환전2 사용(ViaAfter→Target)
          </label>
          <label style={{ display: "inline-flex", alignItems: "center", gap: 8, color: CSSVARS.sub }}>
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

        {/* 드롭다운 */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(0, 1fr))", gap: 12, marginBottom: 12 }}>
          <Field label="보내는 통화 (Base)">
            <select value={baseCurrency} onChange={(e) => setBaseCurrency(e.target.value as Currency)} style={baseInputStyle}>
              {currencies.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </Field>
          <Field label="중간 환전 (사전 ViaBefore)">
            <select value={viaFiatBefore} onChange={(e) => setViaFiatBefore(e.target.value as Currency)} style={baseInputStyle}>
              {currencies.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </Field>
          <Field label="스테이블 코인">
            <select value={stableSymbol} onChange={(e) => setStableSymbol(e.target.value as StableSymbol)} style={baseInputStyle}>
              {stables.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </Field>
          <Field label="중간 환전 (사후 ViaAfter)">
            <select value={viaFiatAfter} onChange={(e) => setViaFiatAfter(e.target.value as Currency)} style={baseInputStyle}>
              {currencies.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </Field>
          <Field label="받는 통화 (Target)">
            <select value={targetCurrency} onChange={(e) => setTargetCurrency(e.target.value as Currency)} style={baseInputStyle}>
              {currencies.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </Field>
        </div>

        {/* 금액/수수료 */}
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

        {/* 액션: 견적 계산 */}
        <div style={{ display: "flex", gap: 10, marginBottom: 8, flexWrap: "wrap" }}>
          <button onClick={handleQuote} disabled={loading} className={btn}>견적 계산</button>
        </div>

        {/* 에러 */}
        {errorMsg && (
          <p style={{ marginBottom: 8, padding: "6px 8px", background: "#201317", borderRadius: 8, color: "#ff6b6b" }}>
            {errorMsg}
          </p>
        )}

        {/* 결과 */}
        {quote && hasTotals(quote) && (
          <div style={{ marginTop: 8, marginBottom: 6, lineHeight: 1.7, background: CSSVARS.inputBg, border: `1px solid ${CSSVARS.border}`, borderRadius: 12, padding: 12 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <Stat label={`최종 수취액 (${finalUnit})`} value={`${quote.totals.finalTargetAmount}`} />
              <Stat label={`총 수수료 (${finalUnit})`} value={`${quote.fees.totalFeeInTarget}`} />
            </div>
            {quote.hooks?.notes?.length ? (
              <div style={{ marginTop: 8, color: CSSVARS.sub, fontSize: 12 }}>
                {quote.hooks.notes.map((n, i) => <div key={i}>• {n}</div>)}
              </div>
            ) : null}
          </div>
        )}
      </div>

      {/* Perplexity 다이얼로그 — 비활성 단계면 통째로 숨김 */}
      {(!trendsStage || isStageVisible(trendsStage)) && (
        <dialog
          ref={trendsDialogRef}
          style={{
            maxWidth: 820,
            width: "90%",
            border: `1px solid ${CSSVARS.borderStrong}`,
            borderRadius: 16,
            padding: 0,
            background: CSSVARS.panel,
            color: CSSVARS.text,
          }}
        >
          <form method="dialog" style={{ margin: 0 }}>
            <div style={{ padding: 16, borderBottom: `1px solid ${CSSVARS.border}`, background: "#0f1320", borderTopLeftRadius: 16, borderTopRightRadius: 16 }}>
              <h3 style={{ margin: 0 }}>
                최신 동향 보고서 — {trendsStage === "fxBefore" ? "환전1(사전)" : trendsStage === "coin" ? "코인" : trendsStage === "fxAfter" ? "환전2(사후)" : "최종"}
              </h3>
            </div>
            <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.7, padding: 16, color: CSSVARS.sub }}>
              {trendsText}
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", padding: 12, gap: 8 }}>
              <button className="button" onClick={() => trendsDialogRef.current?.close()} style={{ padding: "8px 14px" }}>
                닫기
              </button>
            </div>
          </form>
        </dialog>
      )}
    </div>
  );
}

/** 소품들 */
function ToolbarSingle(props: { title: string; caption: string; onTrends: () => void }) {
  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 12,
      padding: "10px 12px",
      margin: "8px 0",
      border: `1px solid ${CSSVARS.border}`,
      borderRadius: 12,
      background: CSSVARS.inputBg,
    }}>
      <div>
        <div style={{ fontWeight: 600 }}>{props.title}</div>
        <div style={{ color: CSSVARS.sub, fontSize: 12 }}>{props.caption}</div>
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={props.onTrends} className="button btn-alt-2">최신 동향 (Perplexity)</button>
      </div>
    </div>
  );
}

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
          border: `1px solid ${CSSVARS.border}`,
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
            border: `1px solid ${CSSVARS.border}`,
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
function Arrow() { return <span style={{ opacity: 0.6, color: CSSVARS.sub }}>→</span>; }
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
