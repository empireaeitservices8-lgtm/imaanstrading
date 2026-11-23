import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getBackendUrl } from "@/lib/backendConfig";
import { verifyJwtHs256 } from "@/lib/serverAuth";

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    // 1. Next.js 15: params argument is a Promise; validate numeric id
    const { id } = await context.params;
    const numId = Number(id);
    if (!id || isNaN(numId)) {
      return NextResponse.json({ error: "Review ID must be a valid number." }, { status: 400 });
    }

    // 2. Verify admin session
    const cookieStore = await cookies();
    const token = cookieStore.get("token")?.value;
    const authHeader = request.headers.get("authorization") || "";
    const bearerToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
    const activeToken = token || bearerToken;

    let isAdmin = false;
    if (activeToken) {
      const decoded = verifyJwtHs256(activeToken);
      if (decoded && decoded.role === "admin") {
        isAdmin = true;
      }
    }

    const refreshToken = cookieStore.get("refreshToken")?.value;
    if (!isAdmin && !refreshToken && !authHeader) {
      return NextResponse.json({ error: "Unauthorized: Admin privileges required." }, { status: 401 });
    }

    // 3. Dispatch to backend API
    const backendBase = getBackendUrl();
    const cookieHeader = request.headers.get("cookie") || request.cookies.toString() || "";

    const res = await fetch(`${backendBase}/api/admin/reviews/${numId}`, {
      method: "DELETE",
      headers: {
        cookie: cookieHeader,
        ...(authHeader ? { authorization: authHeader } : {}),
      },
    });

    const rawText = await res.text().catch(() => "");
    let data: Record<string, any> = {};
    try {
      data = JSON.parse(rawText);
    } catch {
      const cleanError = rawText.replace(/<[^>]+>/g, "").trim();
      data = { error: cleanError && cleanError.length < 200 ? cleanError : "Failed to delete review." };
    }

    if (!res.ok) {
      return NextResponse.json(
        { error: data.error || data.message || "Failed to delete review." },
        { status: res.status }
      );
    }

    // 4. Return success 200
    return NextResponse.json(
      { success: true, message: data.message || "Review deleted successfully." },
      { status: 200 }
    );
  } catch (err: unknown) {
    console.error("DELETE /api/admin/reviews/[id] error:", (err as Error)?.message || err);
    return NextResponse.json(
      { error: (err as Error)?.message || "Failed to delete review" },
      { status: 500 }
    );
  }
}

