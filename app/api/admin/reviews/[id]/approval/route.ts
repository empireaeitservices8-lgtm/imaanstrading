import { NextRequest, NextResponse } from "next/server";
import { getBackendUrl } from "@/lib/backendConfig";

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const params = await Promise.resolve(context?.params);
    const id = params?.id;
    if (!id) {
      return NextResponse.json({ error: "Review ID is required." }, { status: 400 });
    }

    const backendBase = getBackendUrl();
    const body = await request.json().catch(() => ({}));
    const cookieHeader = request.headers.get("cookie") || request.cookies.toString() || "";
    const authHeader = request.headers.get("authorization") || "";

    const res = await fetch(`${backendBase}/api/admin/reviews/${encodeURIComponent(id)}/approval`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        cookie: cookieHeader,
        ...(authHeader ? { authorization: authHeader } : {}),
      },
      body: JSON.stringify(body),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return NextResponse.json(
        { error: data.error || "Failed to update review approval." },
        { status: res.status }
      );
    }
    return NextResponse.json(data, { status: 200 });
  } catch (err: unknown) {
    console.error("PATCH /api/admin/reviews/[id]/approval proxy error:", (err as Error)?.message || err);
    return NextResponse.json(
      { error: (err as Error)?.message || "Failed to update review approval" },
      { status: 500 }
    );
  }
}
