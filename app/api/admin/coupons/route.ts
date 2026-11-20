import { NextRequest, NextResponse, connection } from "next/server";
import { getBackendUrl } from "@/lib/backendConfig";

export async function GET(request: NextRequest) {
  await connection();
  const backendBase = getBackendUrl();
  try {
    const cookieHeader = request.headers.get("cookie") || request.cookies.toString() || "";
    const authHeader = request.headers.get("authorization") || "";

    const res = await fetch(`${backendBase}/api/admin/coupons`, {
      cache: "no-store",
      headers: {
        cookie: cookieHeader,
        ...(authHeader ? { authorization: authHeader } : {}),
      },
    });
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch (err: unknown) {
    console.error("GET /api/admin/coupons proxy error:", (err as Error)?.message || err);
    return NextResponse.json({ error: "Failed to load coupons" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const backendBase = getBackendUrl();
  try {
    const body = await request.json();
    const cookieHeader = request.headers.get("cookie") || request.cookies.toString() || "";
    const authHeader = request.headers.get("authorization") || "";

    const res = await fetch(`${backendBase}/api/admin/coupons`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        cookie: cookieHeader,
        ...(authHeader ? { authorization: authHeader } : {}),
      },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch (err: unknown) {
    console.error("POST /api/admin/coupons proxy error:", (err as Error)?.message || err);
    return NextResponse.json({ error: "Failed to create coupon" }, { status: 500 });
  }
}

