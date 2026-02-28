import type { Role } from "@/lib/types";

export const ROLE_LABELS: Record<Role, string> = {
  super_admin: "Super Admin",
  admin: "Admin",
  operations_consigner: "Ops (Consigner)",
  operations_vehicles: "Ops (Vehicles)",
  sales_vehicles: "Sales (Vehicles)",
  sales_consigner: "Sales (Consigner)",
  accounts: "Accounts",
  support: "Support",
};

export const ROLE_BADGE_COLORS: Record<Role, string> = {
  super_admin: "bg-purple-50 text-purple-700",
  admin: "bg-violet-50 text-violet-700",
  operations_consigner: "bg-cyan-50 text-cyan-700",
  operations_vehicles: "bg-cyan-50 text-cyan-700",
  sales_vehicles: "bg-blue-50 text-blue-700",
  sales_consigner: "bg-blue-50 text-blue-700",
  accounts: "bg-emerald-50 text-emerald-700",
  support: "bg-pink-50 text-pink-700",
};

export const ROLE_OPTIONS: Array<{ value: Role; label: string }> = [
  { value: "super_admin", label: ROLE_LABELS.super_admin },
  { value: "admin", label: ROLE_LABELS.admin },
  { value: "operations_consigner", label: ROLE_LABELS.operations_consigner },
  { value: "operations_vehicles", label: ROLE_LABELS.operations_vehicles },
  { value: "sales_vehicles", label: ROLE_LABELS.sales_vehicles },
  { value: "sales_consigner", label: ROLE_LABELS.sales_consigner },
  { value: "accounts", label: ROLE_LABELS.accounts },
  { value: "support", label: ROLE_LABELS.support },
];

export const CREATE_USER_ROLE_OPTIONS: Array<{ value: Role; label: string }> = [
  { value: "admin", label: ROLE_LABELS.admin },
  { value: "operations_consigner", label: ROLE_LABELS.operations_consigner },
  { value: "operations_vehicles", label: ROLE_LABELS.operations_vehicles },
  { value: "sales_vehicles", label: ROLE_LABELS.sales_vehicles },
  { value: "sales_consigner", label: ROLE_LABELS.sales_consigner },
  { value: "accounts", label: ROLE_LABELS.accounts },
  { value: "support", label: ROLE_LABELS.support },
];

export const ROLE_VALUES = ROLE_OPTIONS.map((option) => option.value);
export const ADMIN_ROLES: Role[] = ["super_admin", "admin"];
