"use client";

import * as React from "react";
import { Input } from "@/components/ui/input";

/**
 * An input that can only ever hold digits.
 *
 * Non-digits are stripped on the way in rather than blocked on keypress, so a
 * pasted "+91 98765 43210" or "9876-543-210" becomes 919876543210 instead of
 * being silently rejected — the same result whichever way it was entered.
 *
 * type="text" with inputMode="numeric", not type="number": a number input still
 * accepts "e", "+" and "-", scroll-wheels its value when the page moves under
 * the cursor, and reports "" for anything it considers malformed, which hides
 * what the user actually typed.
 *
 * For amounts, use a normal <Input> — these fields are digit strings
 * (phone, Aadhaar, account number), not quantities, and must not lose a
 * leading zero or gain a decimal point.
 */
interface NumericInputProps
  extends Omit<React.ComponentProps<typeof Input>, "onChange" | "value" | "type"> {
  value: string;
  onValueChange: (digits: string) => void;
  /** Hard cap on digit count — also the field's maxLength. */
  maxDigits: number;
}

export function NumericInput({
  value,
  onValueChange,
  maxDigits,
  ...props
}: NumericInputProps) {
  return (
    <Input
      {...props}
      type="text"
      inputMode="numeric"
      value={value}
      maxLength={maxDigits}
      onChange={(event) =>
        onValueChange(event.target.value.replace(/\D/g, "").slice(0, maxDigits))
      }
    />
  );
}
