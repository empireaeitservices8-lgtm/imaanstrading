import { NextRequest, NextResponse } from "next/server";
import { getBackendUrl } from "@/lib/backendConfig";

export async function DELETE(
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
    const cookieHeader = request.headers.get("cookie") || request.cookies.toString() || "";
    const authHeader = request.headers.get("authorization") || "";

    const res = await fetch(`${backendBase}/api/admin/reviews/${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: {
        cookie: cookieHeader,
        ...(authHeader ? { authorization: authHeader } : {}),
      },
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return NextResponse.json(
        { error: data.error || "Failed to delete review." },
        { status: res.status }
      );
    }
    return NextResponse.json(data, { status: 200 });
  } catch (err: unknown) {
    console.error("DELETE /api/admin/reviews/[id] proxy error:", (err as Error)?.message || err);
    return NextResponse.json(
      { error: (err as Error)?.message || "Failed to delete review" },
      { status: 500 }
    );
  }
}

