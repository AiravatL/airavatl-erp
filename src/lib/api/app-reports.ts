import { apiRequest } from "@/lib/api/http";

/* ---------- Types ---------- */

export interface OverviewFilters {
  from?: string;
  to?: string;
}

export interface BreakdownItem {
  label: string;
  value: number;
}

export interface AppOverview {
  metrics: {
    totalUsers: number;
    newUsers: number;
    deliveryRequests: number;
    tripsCreated: number;
    liveDrivers: number;
    paymentsCount: number;
    paymentsVolume: number;
    platformRevenue: number;
    totalPayouts: number;
  };
  usersByType: BreakdownItem[];
  tripsByStatus: BreakdownItem[];
  paymentsByStatus: BreakdownItem[];
}

export interface AuctionItem {
  id: string;
  requestNumber: string;
  status: string;
  requestType: string;
  consignerName: string;
  pickupCity: string;
  deliveryCity: string;
  vehicleType: string;
  totalBidsCount: number;
  lowestBidAmount: number | null;
  createdAt: string;
}

export interface AppTripItem {
  id: string;
  tripNumber: string;
  requestNumber: string | null;
  status: string;
  tripAmount: number;
  consignerName: string;
  driverName: string | null;
  pickupCity: string;
  deliveryCity: string;
  createdAt: string;
}

export interface PaymentItem {
  id: string;
  tripNumber: string;
  paymentType: string;
  amount: number;
  method: string | null;
  status: string;
  razorpayOrderId: string | null;
  razorpayPaymentId: string | null;
  consignerName: string | null;
  driverName: string | null;
  createdAt: string;
}

export interface PayoutItem {
  id: string;
  tripNumber: string;
  driverName: string;
  payoutType: string;
  amount: number;
  status: string;
  razorpayPayoutId: string | null;
  utr: string | null;
  razorpayStatus: string | null;
  createdAt: string;
}

export interface CustomerItem {
  consignerId: string;
  registeredName: string;
  businessName: string | null;
  fullName: string;
  phone: string;
  email: string | null;
  salesOwnerName: string | null;
  active: boolean;
  activeTripsCount: number;
  totalTripsCount: number;
  totalTripValue: number;
  outstandingAmount: number;
  creditHealth: string;
  creditLimit: number;
  createdAt: string;
}

export interface DriverLocationItem {
  driverId: string;
  driverName: string;
  phone: string;
  driverType: string;
  latitude: number;
  longitude: number;
  heading: number | null;
  speedKmph: number | null;
  accuracyMeters: number | null;
  batteryLevel: number | null;
  isGpsEnabled: boolean;
  isOnline: boolean;
  acceptingAuction: boolean;
  acceptingInstant: boolean;
  currentTripId: string | null;
  activeVehicleId: string | null;
  updatedAt: string;
}

export interface PaginatedResponse<T> {
  total: number;
  items: T[];
}

/* ---------- Query helpers ---------- */

function buildQuery(params: object) {
  const sp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") {
      sp.set(key, String(value));
    }
  }
  const qs = sp.toString();
  return qs ? `?${qs}` : "";
}

function toNum(v: unknown): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function toNullNum(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function str(v: unknown): string {
  return String(v ?? "");
}

/* ---------- Normalizers ---------- */

function normalizeOverview(raw: Record<string, unknown>): AppOverview {
  const m = (raw.metrics ?? {}) as Record<string, unknown>;
  const bd = (raw.breakdowns ?? {}) as Record<string, unknown>;
  return {
    metrics: {
      totalUsers: toNum(m.usersTotal ?? m.total_users),
      newUsers: toNum(m.usersCreated ?? m.new_users),
      deliveryRequests: toNum(m.deliveryRequests ?? m.delivery_requests),
      tripsCreated: toNum(m.tripsCreated ?? m.trips_created),
      liveDrivers: toNum(m.liveDrivers ?? m.live_drivers),
      paymentsCount: toNum(m.paymentsCount ?? m.payments_count),
      paymentsVolume: toNum(m.paymentsVolume ?? m.payments_volume),
      platformRevenue: toNum(m.platformRevenue ?? m.platform_revenue),
      totalPayouts: toNum(m.driverPayoutVolume ?? m.total_payouts),
    },
    usersByType: normalizeBreakdown(bd.usersByType ?? raw.users_by_type),
    tripsByStatus: normalizeBreakdown(bd.tripsByStatus ?? raw.trips_by_status),
    paymentsByStatus: normalizeBreakdown(bd.paymentsByStatus ?? raw.payments_by_status),
  };
}

function normalizeBreakdown(v: unknown): BreakdownItem[] {
  // Handle array format: [{label, value}]
  if (Array.isArray(v)) {
    return v.map((item) => {
      const row = (item ?? {}) as Record<string, unknown>;
      return { label: str(row.label), value: toNum(row.value) };
    });
  }
  // Handle object format: { key: count }
  if (v && typeof v === "object") {
    return Object.entries(v as Record<string, unknown>).map(([label, value]) => ({
      label: prettifyLabel(label),
      value: toNum(value),
    }));
  }
  return [];
}

function prettifyLabel(s: string): string {
  return s.split("_").map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(" ");
}

function normalizeAuction(row: Record<string, unknown>): AuctionItem {
  return {
    id: str(row.id),
    requestNumber: str(row.request_number),
    status: str(row.status),
    requestType: str(row.request_type),
    consignerName: str(row.consigner_name),
    pickupCity: str(row.pickup_city),
    deliveryCity: str(row.delivery_city),
    vehicleType: str(row.vehicle_type),
    totalBidsCount: toNum(row.total_bids_count),
    lowestBidAmount: toNullNum(row.lowest_bid_amount),
    createdAt: str(row.created_at),
  };
}

function normalizeTrip(row: Record<string, unknown>): AppTripItem {
  return {
    id: str(row.id),
    tripNumber: str(row.trip_number),
    requestNumber: row.request_number ? str(row.request_number) : null,
    status: str(row.status),
    tripAmount: toNum(row.trip_amount),
    consignerName: str(row.consigner_name),
    driverName: row.driver_name ? str(row.driver_name) : null,
    pickupCity: str(row.pickup_city),
    deliveryCity: str(row.delivery_city),
    createdAt: str(row.created_at),
  };
}

function normalizePayment(row: Record<string, unknown>): PaymentItem {
  return {
    id: str(row.id),
    tripNumber: str(row.trip_number),
    paymentType: str(row.payment_type),
    amount: toNum(row.amount),
    method: row.method ? str(row.method) : null,
    status: str(row.status),
    razorpayOrderId: row.razorpay_order_id ? str(row.razorpay_order_id) : null,
    razorpayPaymentId: row.razorpay_payment_id ? str(row.razorpay_payment_id) : null,
    consignerName: row.consigner_name ? str(row.consigner_name) : null,
    driverName: row.driver_name ? str(row.driver_name) : null,
    createdAt: str(row.created_at),
  };
}

function normalizePayout(row: Record<string, unknown>): PayoutItem {
  return {
    id: str(row.id),
    tripNumber: str(row.trip_number),
    driverName: str(row.driver_name),
    payoutType: str(row.payout_type),
    amount: toNum(row.amount),
    status: str(row.status),
    razorpayPayoutId: row.razorpay_payout_id ? str(row.razorpay_payout_id) : null,
    utr: row.utr ? str(row.utr) : null,
    razorpayStatus: row.razorpay_status ? str(row.razorpay_status) : null,
    createdAt: str(row.created_at),
  };
}

function normalizeCustomer(row: Record<string, unknown>): CustomerItem {
  return {
    consignerId: str(row.consigner_id),
    registeredName: str(row.registered_name),
    businessName: row.business_name ? str(row.business_name) : null,
    fullName: str(row.full_name),
    phone: str(row.phone),
    email: row.email ? str(row.email) : null,
    salesOwnerName: row.sales_owner_name ? str(row.sales_owner_name) : null,
    active: Boolean(row.active),
    activeTripsCount: toNum(row.active_trips_count),
    totalTripsCount: toNum(row.total_trips_count),
    totalTripValue: toNum(row.total_trip_value),
    outstandingAmount: toNum(row.outstanding_amount),
    creditHealth: str(row.credit_health),
    creditLimit: toNum(row.credit_limit),
    createdAt: str(row.created_at),
  };
}

function normalizeDriverLocation(row: Record<string, unknown>): DriverLocationItem {
  return {
    driverId: str(row.driver_id),
    driverName: str(row.driver_name),
    phone: str(row.phone),
    driverType: str(row.driver_type),
    latitude: toNum(row.latitude),
    longitude: toNum(row.longitude),
    heading: toNullNum(row.heading),
    speedKmph: toNullNum(row.speed_kmph),
    accuracyMeters: toNullNum(row.accuracy_meters),
    batteryLevel: toNullNum(row.battery_level),
    isGpsEnabled: Boolean(row.is_gps_enabled),
    isOnline: Boolean(row.is_online),
    acceptingAuction: Boolean(row.accepting_auction),
    acceptingInstant: Boolean(row.accepting_instant),
    currentTripId: row.current_trip_id ? str(row.current_trip_id) : null,
    activeVehicleId: row.active_vehicle_id ? str(row.active_vehicle_id) : null,
    updatedAt: str(row.updated_at),
  };
}

/* ---------- Fetchers ---------- */

export async function getAppOverview(filters: OverviewFilters = {}): Promise<AppOverview> {
  const raw = await apiRequest<Record<string, unknown>>(
    `/api/reports/overview${buildQuery({ from: filters.from, to: filters.to })}`,
    { method: "GET", cache: "no-store" },
  );
  return normalizeOverview(raw);
}

export interface AuctionFilters {
  status?: string;
  requestType?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

export async function listAuctions(filters: AuctionFilters = {}): Promise<PaginatedResponse<AuctionItem>> {
  const raw = await apiRequest<{ total: number; items: Record<string, unknown>[] }>(
    `/api/reports/auctions${buildQuery(filters)}`,
    { method: "GET", cache: "no-store" },
  );
  return { total: raw.total, items: raw.items.map(normalizeAuction) };
}

export interface AppTripFilters {
  status?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

export async function listAppTrips(filters: AppTripFilters = {}): Promise<PaginatedResponse<AppTripItem>> {
  const raw = await apiRequest<{ total: number; items: Record<string, unknown>[] }>(
    `/api/reports/trips${buildQuery(filters)}`,
    { method: "GET", cache: "no-store" },
  );
  return { total: raw.total, items: raw.items.map(normalizeTrip) };
}

export interface PaymentFilters {
  status?: string;
  paymentType?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

export async function listPayments(filters: PaymentFilters = {}): Promise<PaginatedResponse<PaymentItem>> {
  const raw = await apiRequest<{ total: number; items: Record<string, unknown>[] }>(
    `/api/reports/payments${buildQuery(filters)}`,
    { method: "GET", cache: "no-store" },
  );
  return { total: raw.total, items: raw.items.map(normalizePayment) };
}

export interface PayoutFilters {
  status?: string;
  limit?: number;
  offset?: number;
}

export async function listPayouts(filters: PayoutFilters = {}): Promise<PaginatedResponse<PayoutItem>> {
  const raw = await apiRequest<{ total: number; items: Record<string, unknown>[] }>(
    `/api/reports/payouts${buildQuery(filters)}`,
    { method: "GET", cache: "no-store" },
  );
  return { total: raw.total, items: raw.items.map(normalizePayout) };
}

export interface CustomerFilters {
  search?: string;
  active?: boolean;
  creditHealth?: string;
  limit?: number;
  offset?: number;
}

export async function listCustomers(filters: CustomerFilters = {}): Promise<PaginatedResponse<CustomerItem>> {
  const raw = await apiRequest<{ total: number; items: Record<string, unknown>[] }>(
    `/api/reports/customers${buildQuery(filters)}`,
    { method: "GET", cache: "no-store" },
  );
  return { total: raw.total, items: raw.items.map(normalizeCustomer) };
}

export interface DriverLocationFilters {
  onlineOnly?: boolean;
}

export async function listDriverLocations(filters: DriverLocationFilters = {}): Promise<{ items: DriverLocationItem[] }> {
  const raw = await apiRequest<{ items: Record<string, unknown>[] }>(
    `/api/reports/driver-locations${buildQuery({ onlineOnly: filters.onlineOnly || undefined })}`,
    { method: "GET", cache: "no-store" },
  );
  return { items: raw.items.map(normalizeDriverLocation) };
}
