"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { readLedger, verifyChain } from "@/lib/ledger";
import { consumeStaffLoginAttempt } from "@/lib/rate-limit";
import { clientIp, hashIp } from "@/lib/request-ip";
import {
  checkStaffPassword,
  createStaffSession,
  isValidStaffSession,
  STAFF_COOKIE,
  STAFF_SESSION_SECONDS,
} from "@/lib/staff-auth";
import { getStore } from "@/lib/store";

export interface LoginState {
  error?: string;
}

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const password = String(formData.get("password") ?? "");
  const store = getStore();
  const allowed = await consumeStaffLoginAttempt(store, hashIp(clientIp(await headers())));
  if (!allowed) return { error: "Too many attempts. Please wait 15 minutes and try again." };
  if (!process.env.STAFF_PASSWORD) return { error: "Staff access is not configured." };
  if (!checkStaffPassword(password)) return { error: "That password is not correct." };

  (await cookies()).set(STAFF_COOKIE, createStaffSession(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/staff",
    maxAge: STAFF_SESSION_SECONDS,
  });
  redirect("/staff");
}

export async function logout(): Promise<void> {
  (await cookies()).delete({ name: STAFF_COOKIE, path: "/staff" });
  redirect("/staff");
}

export type VerifyState =
  | { status: "idle" }
  | { status: "ok"; length: number; checkedAt: string }
  | { status: "broken"; length: number; brokenIndex: number; checkedAt: string }
  | { status: "error"; message: string };

export async function verifyLedgerChain(): Promise<VerifyState> {
  if (!isValidStaffSession((await cookies()).get(STAFF_COOKIE)?.value)) {
    return { status: "error", message: "Your staff session has ended. Please sign in again." };
  }
  const result = verifyChain(await readLedger(getStore()));
  const checkedAt = new Date().toISOString();
  return result.ok
    ? { status: "ok", length: result.length, checkedAt }
    : { status: "broken", length: result.length, brokenIndex: result.broken_index, checkedAt };
}
