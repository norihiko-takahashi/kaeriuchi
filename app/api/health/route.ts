import { NextResponse } from "next/server";
import { getConfig } from "@/server/config";

/** アプリが動いているか。外部のサービスにはつながない（infrastructure-design.md §5） */
export function GET() {
  getConfig();
  return NextResponse.json(
    { status: "ok", version: process.env.GIT_SHA ?? "dev" },
    { headers: { "Cache-Control": "no-store" } },
  );
}
