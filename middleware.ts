import { NextResponse } from "next/server";

// Auth is handled at the layout level (app/portal/layout.tsx, app/admin/layout.tsx)
export function middleware() {
  return NextResponse.next();
}

export const config = {
  matcher: [],
};
