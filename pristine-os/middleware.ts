import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { can, type Permission } from "@/lib/permissions";

// Pages that need more than a signed-in user. This is navigation
// convenience only — the role in the JWT can be stale, so every API
// route re-checks permissions against the database (lib/authz.ts).
const PAGE_PERMISSIONS: { prefix: string; permission: Permission }[] = [
  { prefix: "/staff", permission: "staff.view" },
];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Always allow the login page and NextAuth's own routes (csrf/session/callback)
  if (pathname === "/login" || pathname.startsWith("/api/auth")) {
    return NextResponse.next();
  }

  const token = await getToken({
    req: request,
    secret: process.env.NEXTAUTH_SECRET,
  });

  // API callers get a JSON 401 rather than an HTML redirect.
  if (!token) {
    if (pathname.startsWith("/api/")) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    return NextResponse.redirect(new URL("/login", request.url));
  }

  const rule = PAGE_PERMISSIONS.find(
    ({ prefix }) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );

  if (rule && !can(token.role, rule.permission)) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
