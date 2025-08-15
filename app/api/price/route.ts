import { NextResponse } from "next/server";

export async function GET() {
  try {
    const res = await fetch(`${process.env.UPBIT_BASE_URL}/ticker?markets=KRW-BTC`);
    const data = await res.json();
    return NextResponse.json({ success: true, price: data[0] });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}
