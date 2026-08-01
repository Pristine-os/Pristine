import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const loggedIn = request.cookies.get("loggedIn")?.value;

  const { pathname } = request.nextUrl;

  // Always allow login page
  if (pathname === "/login") {
    return NextResponse.next();
  }

  // If not logged in → force login
  if (!loggedIn) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};