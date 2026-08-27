import { NextResponse } from "next/server";
import { UnauthenticatedError, UnauthorizedError } from "@/lib/rbac";

/** Turns a caught error into the right HTTP response for a route handler. */
export function toErrorResponse(err: unknown) {
  if (err instanceof UnauthenticatedError || err instanceof UnauthorizedError) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  if (err instanceof Error) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
  return NextResponse.json({ error: "Erro inesperado" }, { status: 500 });
}
