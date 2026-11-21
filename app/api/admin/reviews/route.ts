import { NextRequest, NextResponse, connection } from "next/server";
import { getBackendUrl } from "@/lib/backendConfig";

export async function GET(request: NextRequest) {
  await connection();
  const backendBase = getBackendUrl();
  try {
    const cookieHeader = request.headers.get("cookie") || request.cookies.toString() || "";
    const authHeader = request.headers.get("authorization") || "";

    const res = await fetch(`${backendBase}/api/admin/reviews`, {
      cache: "no-store",
      headers: {
        cookie: cookieHeader,
        ...(authHeader ? { authorization: authHeader } : {}),
      },
    });
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch (err: unknown) {
    console.error("GET /api/admin/reviews proxy error:", (err as Error)?.message || err);
    return NextResponse.json({ error: "Failed to load reviews" }, { status: 500 });
  }
}

