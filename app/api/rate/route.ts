import { NextResponse } from "next/server";

export async function GET() {
  try {
    const res = await fetch(process.env.EXCHANGE_RATE_API_URL!);
    const data = await res.json();
    return NextResponse.json({ success: true, rate: data.rates.KRW });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}
