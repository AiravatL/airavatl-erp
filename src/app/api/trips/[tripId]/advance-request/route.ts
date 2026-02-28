import { NextResponse } from "next/server";
import { isMissingRpcError } from "@/lib/supabase/rpc";
import { mapRpcError, requireTripActor } from "@/app/api/trips/_shared";

interface AdvanceRequestBody {
  amount?: unknown;
  beneficiary?: unknown;
  notes?: unknown;
  paymentMethod?: unknown;
  bankAccountHolder?: unknown;
  bankAccountNumber?: unknown;
  bankIfsc?: unknown;
  bankName?: unknown;
  upiId?: unknown;
  upiQrObjectKey?: unknown;
  upiQrFileName?: unknown;
  upiQrMimeType?: unknown;
  upiQrSizeBytes?: unknown;
}

const MAX_AMOUNT = 1_000_000_000_000;
const MAX_TEXT = 120;
const MAX_NOTES = 500;
const MAX_ACCOUNT_NUMBER = 34;
const MAX_UPI_ID = 120;
const MAX_UPI_QR_SIZE_BYTES = 10 * 1024 * 1024;
const IFSC_REGEX = /^[A-Z]{4}0[A-Z0-9]{6}$/;
const UPI_ID_REGEX = /^[a-zA-Z0-9.\-_]{2,64}@[a-zA-Z]{2,64}$/;

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toTrimmedString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isPaymentMethod(value: string): value is "bank" | "upi" {
  return value === "bank" || value === "upi";
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ tripId: string }> },
) {
  const actorResult = await requireTripActor();
  if ("error" in actorResult) return actorResult.error;

  const { tripId } = await params;
  const body = (await request.json().catch(() => null)) as AdvanceRequestBody | null;

  const amount = toNumber(body?.amount);
  const beneficiary = toTrimmedString(body?.beneficiary);
  const notes = toTrimmedString(body?.notes);
  const paymentMethod = toTrimmedString(body?.paymentMethod).toLowerCase();

  const bankAccountHolder = toTrimmedString(body?.bankAccountHolder);
  const bankAccountNumber = toTrimmedString(body?.bankAccountNumber);
  const bankIfsc = toTrimmedString(body?.bankIfsc).toUpperCase();
  const bankName = toTrimmedString(body?.bankName);

  const upiId = toTrimmedString(body?.upiId);
  const upiQrObjectKey = toTrimmedString(body?.upiQrObjectKey);
  const upiQrFileName = toTrimmedString(body?.upiQrFileName);
  const upiQrMimeType = toTrimmedString(body?.upiQrMimeType);
  const upiQrSizeBytes = toNumber(body?.upiQrSizeBytes);

  if (amount === null || amount <= 0 || amount > MAX_AMOUNT) {
    return NextResponse.json({ ok: false, message: "amount is out of range" }, { status: 400 });
  }
  if (beneficiary.length > MAX_TEXT) {
    return NextResponse.json({ ok: false, message: "beneficiary is too long" }, { status: 400 });
  }
  if (notes.length > MAX_NOTES) {
    return NextResponse.json({ ok: false, message: "notes is too long" }, { status: 400 });
  }
  if (!isPaymentMethod(paymentMethod)) {
    return NextResponse.json({ ok: false, message: "paymentMethod must be bank or upi" }, { status: 400 });
  }

  if (paymentMethod === "bank") {
    if (!bankAccountHolder || !bankAccountNumber || !bankIfsc || !bankName) {
      return NextResponse.json({ ok: false, message: "Bank details are required" }, { status: 400 });
    }
    if (!/^\d{6,34}$/.test(bankAccountNumber) || bankAccountNumber.length > MAX_ACCOUNT_NUMBER) {
      return NextResponse.json({ ok: false, message: "Invalid bank account number" }, { status: 400 });
    }
    if (!IFSC_REGEX.test(bankIfsc)) {
      return NextResponse.json({ ok: false, message: "Invalid IFSC code" }, { status: 400 });
    }
  }

  if (paymentMethod === "upi") {
    if (!upiId && !upiQrObjectKey) {
      return NextResponse.json({ ok: false, message: "Provide UPI ID or upload QR" }, { status: 400 });
    }
    if (upiId) {
      if (upiId.length > MAX_UPI_ID || !UPI_ID_REGEX.test(upiId)) {
        return NextResponse.json({ ok: false, message: "Invalid UPI ID" }, { status: 400 });
      }
    }
    if (upiQrObjectKey) {
      if (!upiQrFileName || !upiQrMimeType) {
        return NextResponse.json(
          { ok: false, message: "UPI QR file metadata is required for uploaded QR" },
          { status: 400 },
        );
      }
      if (!upiQrMimeType.startsWith("image/")) {
        return NextResponse.json({ ok: false, message: "UPI QR must be an image file" }, { status: 400 });
      }
      if (upiQrSizeBytes === null || upiQrSizeBytes <= 0 || upiQrSizeBytes > MAX_UPI_QR_SIZE_BYTES) {
        return NextResponse.json({ ok: false, message: "UPI QR size is out of range" }, { status: 400 });
      }
    }
  }

  const { data: rpcData, error: rpcError } = await actorResult.supabase.rpc("trip_advance_request_create_v1", {
    p_actor_user_id: actorResult.actor.id,
    p_trip_id: tripId,
    p_amount: amount,
    p_beneficiary: beneficiary || null,
    p_notes: notes || null,
    p_payment_method: paymentMethod,
    p_bank_account_holder: bankAccountHolder || null,
    p_bank_account_number: bankAccountNumber || null,
    p_bank_ifsc: bankIfsc || null,
    p_bank_name: bankName || null,
    p_upi_id: upiId || null,
    p_upi_qr_object_key: upiQrObjectKey || null,
    p_upi_qr_file_name: upiQrFileName || null,
    p_upi_qr_mime_type: upiQrMimeType || null,
    p_upi_qr_size_bytes: upiQrSizeBytes,
  } as never);

  if (rpcError) {
    if (isMissingRpcError(rpcError)) {
      return NextResponse.json({ ok: false, message: "Missing RPC: trip_advance_request_create_v1" }, { status: 500 });
    }
    return mapRpcError(rpcError.message ?? "Unable to create advance request", rpcError.code);
  }

  const result = (rpcData ?? null) as {
    id: string;
    trip_id: string;
    trip_code: string;
    amount: number;
    beneficiary: string;
    status: string;
    payment_method: string;
  } | null;

  if (!result) {
    return NextResponse.json({ ok: false, message: "Unable to create advance request" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, data: result }, { status: 201 });
}
