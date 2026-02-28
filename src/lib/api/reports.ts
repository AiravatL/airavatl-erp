import { apiRequest } from "@/lib/api/http";

export type ReportStatus = "ready" | "partial" | "todo";

export interface ReportFilters {
  fromDate?: string;
  toDate?: string;
  ownerId?: string;
  vehicleType?: string;
}

export interface ReportDataQuality {
  status: ReportStatus;
  notes: string[];
}

export interface ReportOverview {
  kpis: {
    totalTrips: number;
    closedTrips: number;
    revenue: number;
    totalExpenses: number;
    grossMarginPct: number;
    outstandingReceivables: number;
  };
  trend: Array<{ month: string; trips: number; revenue: number; expenses: number }>;
  stageMix: Array<{ stage: string; count: number }>;
  paymentStatusMix: Array<{ status: string; count: number; amount: number }>;
  reportStatus: {
    tripPnl: ReportStatus;
    fuelVariance: ReportStatus;
    expenseSummary: ReportStatus;
    utilization: ReportStatus;
    salesPerformance: ReportStatus;
    receivablesAging: ReportStatus;
  };
  dataQuality: ReportDataQuality;
}

export interface TripPnlReport {
  summary: {
    tripCount: number;
    revenue: number;
    expectedCost: number;
    actualCost: number;
    margin: number;
    marginPct: number;
  };
  rows: Array<{
    tripId: string;
    tripCode: string;
    customerName: string;
    route: string;
    vehicleNumber: string;
    tripAmount: number;
    expectedCost: number;
    actualCost: number;
    margin: number;
    variance: number;
  }>;
  dataQuality: ReportDataQuality;
}

export interface ExpenseSummaryReport {
  summary: {
    totalExpenses: number;
    overCapExpenses: number;
    overCapCount: number;
  };
  categoryBreakdown: Array<{ category: string; amount: number; count: number; overCapAmount: number }>;
  monthlyTrend: Array<{ month: string; total: number; overCapTotal: number }>;
  dataQuality: ReportDataQuality;
}

export interface UtilizationReport {
  summary: {
    windowDays: number;
    totalLeasedVehicles: number;
    activeLeasedVehicles: number;
    utilizationPct: number;
  };
  rows: Array<{
    vehicleId: string;
    vehicleNumber: string;
    vehicleType: string;
    tripsCount: number;
    activeDays: number;
    idleDays: number;
    utilizationPct: number;
    totalRevenue: number;
  }>;
  dataQuality: ReportDataQuality;
}

export interface SalesPerformanceReport {
  summary: {
    totalRevenue: number;
    totalCollected: number;
    totalOutstanding: number;
    collectionRatioPct: number;
  };
  rows: Array<{
    ownerId: string | null;
    ownerName: string;
    tripsCount: number;
    closedTrips: number;
    revenue: number;
    collectedAmount: number;
    outstandingAmount: number;
    collectionRatioPct: number;
  }>;
  dataQuality: ReportDataQuality;
}

export interface FuelVarianceReport {
  summary: {
    status: ReportStatus;
  };
  rows: Array<{
    tripId: string;
    tripCode: string;
    route: string;
    vehicleNumber: string;
    actualKm: number | null;
    fuelLiters: number;
    fuelAmount: number;
    fuelAmountPerKm: number | null;
    expectedFuelAmountPerKm: number | null;
    variancePct: number | null;
  }>;
  dataQuality: ReportDataQuality;
}

export interface ReceivablesAgingReport {
  summary: {
    totalOutstanding: number;
  };
  buckets: Array<{
    bucket: string;
    count: number;
    amount: number;
  }>;
  customers: Array<{
    customerId: string;
    customerName: string;
    outstandingAmount: number;
    itemsCount: number;
  }>;
  dataQuality: ReportDataQuality;
}

function toNumber(value: unknown): number {
  if (typeof value === "number") return value;
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toStatus(value: unknown): ReportStatus {
  return value === "ready" || value === "todo" ? value : "partial";
}

function toQuality(value: unknown): ReportDataQuality {
  const input = (value ?? {}) as { status?: unknown; notes?: unknown };
  return {
    status: toStatus(input.status),
    notes: Array.isArray(input.notes) ? input.notes.map((note) => String(note)) : [],
  };
}

function buildQuery(filters: ReportFilters = {}) {
  const params = new URLSearchParams();
  if (filters.fromDate) params.set("fromDate", filters.fromDate);
  if (filters.toDate) params.set("toDate", filters.toDate);
  if (filters.ownerId) params.set("ownerId", filters.ownerId);
  if (filters.vehicleType) params.set("vehicleType", filters.vehicleType);
  const query = params.toString();
  return query ? `?${query}` : "";
}

function normalizeOverview(payload: unknown): ReportOverview {
  const input = (payload ?? {}) as Record<string, unknown>;
  const kpis = (input.kpis ?? {}) as Record<string, unknown>;
  const reportStatus = (input.reportStatus ?? {}) as Record<string, unknown>;

  return {
    kpis: {
      totalTrips: toNumber(kpis.totalTrips),
      closedTrips: toNumber(kpis.closedTrips),
      revenue: toNumber(kpis.revenue),
      totalExpenses: toNumber(kpis.totalExpenses),
      grossMarginPct: toNumber(kpis.grossMarginPct),
      outstandingReceivables: toNumber(kpis.outstandingReceivables),
    },
    trend: Array.isArray(input.trend)
      ? input.trend.map((entry) => {
          const row = (entry ?? {}) as Record<string, unknown>;
          return {
            month: String(row.month ?? ""),
            trips: toNumber(row.trips),
            revenue: toNumber(row.revenue),
            expenses: toNumber(row.expenses),
          };
        })
      : [],
    stageMix: Array.isArray(input.stageMix)
      ? input.stageMix.map((entry) => {
          const row = (entry ?? {}) as Record<string, unknown>;
          return {
            stage: String(row.stage ?? "unknown"),
            count: toNumber(row.count),
          };
        })
      : [],
    paymentStatusMix: Array.isArray(input.paymentStatusMix)
      ? input.paymentStatusMix.map((entry) => {
          const row = (entry ?? {}) as Record<string, unknown>;
          return {
            status: String(row.status ?? "unknown"),
            count: toNumber(row.count),
            amount: toNumber(row.amount),
          };
        })
      : [],
    reportStatus: {
      tripPnl: toStatus(reportStatus.tripPnl),
      fuelVariance: toStatus(reportStatus.fuelVariance),
      expenseSummary: toStatus(reportStatus.expenseSummary),
      utilization: toStatus(reportStatus.utilization),
      salesPerformance: toStatus(reportStatus.salesPerformance),
      receivablesAging: toStatus(reportStatus.receivablesAging),
    },
    dataQuality: toQuality(input.dataQuality),
  };
}

function normalizeTripPnl(payload: unknown): TripPnlReport {
  const input = (payload ?? {}) as Record<string, unknown>;
  const summary = (input.summary ?? {}) as Record<string, unknown>;

  return {
    summary: {
      tripCount: toNumber(summary.tripCount),
      revenue: toNumber(summary.revenue),
      expectedCost: toNumber(summary.expectedCost),
      actualCost: toNumber(summary.actualCost),
      margin: toNumber(summary.margin),
      marginPct: toNumber(summary.marginPct),
    },
    rows: Array.isArray(input.rows)
      ? input.rows.map((entry) => {
          const row = (entry ?? {}) as Record<string, unknown>;
          return {
            tripId: String(row.tripId ?? ""),
            tripCode: String(row.tripCode ?? ""),
            customerName: String(row.customerName ?? ""),
            route: String(row.route ?? ""),
            vehicleNumber: String(row.vehicleNumber ?? ""),
            tripAmount: toNumber(row.tripAmount),
            expectedCost: toNumber(row.expectedCost),
            actualCost: toNumber(row.actualCost),
            margin: toNumber(row.margin),
            variance: toNumber(row.variance),
          };
        })
      : [],
    dataQuality: toQuality(input.dataQuality),
  };
}

function normalizeExpenseSummary(payload: unknown): ExpenseSummaryReport {
  const input = (payload ?? {}) as Record<string, unknown>;
  const summary = (input.summary ?? {}) as Record<string, unknown>;

  return {
    summary: {
      totalExpenses: toNumber(summary.totalExpenses),
      overCapExpenses: toNumber(summary.overCapExpenses),
      overCapCount: toNumber(summary.overCapCount),
    },
    categoryBreakdown: Array.isArray(input.categoryBreakdown)
      ? input.categoryBreakdown.map((entry) => {
          const row = (entry ?? {}) as Record<string, unknown>;
          return {
            category: String(row.category ?? "unknown"),
            amount: toNumber(row.amount),
            count: toNumber(row.count),
            overCapAmount: toNumber(row.overCapAmount),
          };
        })
      : [],
    monthlyTrend: Array.isArray(input.monthlyTrend)
      ? input.monthlyTrend.map((entry) => {
          const row = (entry ?? {}) as Record<string, unknown>;
          return {
            month: String(row.month ?? ""),
            total: toNumber(row.total),
            overCapTotal: toNumber(row.overCapTotal),
          };
        })
      : [],
    dataQuality: toQuality(input.dataQuality),
  };
}

function normalizeUtilization(payload: unknown): UtilizationReport {
  const input = (payload ?? {}) as Record<string, unknown>;
  const summary = (input.summary ?? {}) as Record<string, unknown>;

  return {
    summary: {
      windowDays: toNumber(summary.windowDays),
      totalLeasedVehicles: toNumber(summary.totalLeasedVehicles),
      activeLeasedVehicles: toNumber(summary.activeLeasedVehicles),
      utilizationPct: toNumber(summary.utilizationPct),
    },
    rows: Array.isArray(input.rows)
      ? input.rows.map((entry) => {
          const row = (entry ?? {}) as Record<string, unknown>;
          return {
            vehicleId: String(row.vehicleId ?? ""),
            vehicleNumber: String(row.vehicleNumber ?? ""),
            vehicleType: String(row.vehicleType ?? ""),
            tripsCount: toNumber(row.tripsCount),
            activeDays: toNumber(row.activeDays),
            idleDays: toNumber(row.idleDays),
            utilizationPct: toNumber(row.utilizationPct),
            totalRevenue: toNumber(row.totalRevenue),
          };
        })
      : [],
    dataQuality: toQuality(input.dataQuality),
  };
}

function normalizeSalesPerformance(payload: unknown): SalesPerformanceReport {
  const input = (payload ?? {}) as Record<string, unknown>;
  const summary = (input.summary ?? {}) as Record<string, unknown>;

  return {
    summary: {
      totalRevenue: toNumber(summary.totalRevenue),
      totalCollected: toNumber(summary.totalCollected),
      totalOutstanding: toNumber(summary.totalOutstanding),
      collectionRatioPct: toNumber(summary.collectionRatioPct),
    },
    rows: Array.isArray(input.rows)
      ? input.rows.map((entry) => {
          const row = (entry ?? {}) as Record<string, unknown>;
          return {
            ownerId: row.ownerId ? String(row.ownerId) : null,
            ownerName: String(row.ownerName ?? "Unassigned"),
            tripsCount: toNumber(row.tripsCount),
            closedTrips: toNumber(row.closedTrips),
            revenue: toNumber(row.revenue),
            collectedAmount: toNumber(row.collectedAmount),
            outstandingAmount: toNumber(row.outstandingAmount),
            collectionRatioPct: toNumber(row.collectionRatioPct),
          };
        })
      : [],
    dataQuality: toQuality(input.dataQuality),
  };
}

function normalizeFuelVariance(payload: unknown): FuelVarianceReport {
  const input = (payload ?? {}) as Record<string, unknown>;
  const summary = (input.summary ?? {}) as Record<string, unknown>;

  return {
    summary: {
      status: toStatus(summary.status),
    },
    rows: Array.isArray(input.rows)
      ? input.rows.map((entry) => {
          const row = (entry ?? {}) as Record<string, unknown>;
          return {
            tripId: String(row.tripId ?? ""),
            tripCode: String(row.tripCode ?? ""),
            route: String(row.route ?? ""),
            vehicleNumber: String(row.vehicleNumber ?? ""),
            actualKm: toNullableNumber(row.actualKm),
            fuelLiters: toNumber(row.fuelLiters),
            fuelAmount: toNumber(row.fuelAmount),
            fuelAmountPerKm: toNullableNumber(row.fuelAmountPerKm),
            expectedFuelAmountPerKm: toNullableNumber(row.expectedFuelAmountPerKm),
            variancePct: toNullableNumber(row.variancePct),
          };
        })
      : [],
    dataQuality: toQuality(input.dataQuality),
  };
}

function normalizeReceivablesAging(payload: unknown): ReceivablesAgingReport {
  const input = (payload ?? {}) as Record<string, unknown>;
  const summary = (input.summary ?? {}) as Record<string, unknown>;

  return {
    summary: {
      totalOutstanding: toNumber(summary.totalOutstanding),
    },
    buckets: Array.isArray(input.buckets)
      ? input.buckets.map((entry) => {
          const row = (entry ?? {}) as Record<string, unknown>;
          return {
            bucket: String(row.bucket ?? "unknown"),
            count: toNumber(row.count),
            amount: toNumber(row.amount),
          };
        })
      : [],
    customers: Array.isArray(input.customers)
      ? input.customers.map((entry) => {
          const row = (entry ?? {}) as Record<string, unknown>;
          return {
            customerId: String(row.customerId ?? ""),
            customerName: String(row.customerName ?? ""),
            outstandingAmount: toNumber(row.outstandingAmount),
            itemsCount: toNumber(row.itemsCount),
          };
        })
      : [],
    dataQuality: toQuality(input.dataQuality),
  };
}

export async function getReportOverview(filters: ReportFilters = {}): Promise<ReportOverview> {
  const data = await apiRequest<unknown>(`/api/reports/overview${buildQuery(filters)}`, {
    method: "GET",
    cache: "no-store",
  });
  return normalizeOverview(data);
}

export async function getTripPnlReport(filters: ReportFilters = {}): Promise<TripPnlReport> {
  const data = await apiRequest<unknown>(`/api/reports/trip-pnl${buildQuery(filters)}`, {
    method: "GET",
    cache: "no-store",
  });
  return normalizeTripPnl(data);
}

export async function getExpenseSummaryReport(filters: ReportFilters = {}): Promise<ExpenseSummaryReport> {
  const data = await apiRequest<unknown>(`/api/reports/expense-summary${buildQuery(filters)}`, {
    method: "GET",
    cache: "no-store",
  });
  return normalizeExpenseSummary(data);
}

export async function getUtilizationReport(filters: ReportFilters = {}): Promise<UtilizationReport> {
  const data = await apiRequest<unknown>(`/api/reports/utilization${buildQuery(filters)}`, {
    method: "GET",
    cache: "no-store",
  });
  return normalizeUtilization(data);
}

export async function getSalesPerformanceReport(filters: ReportFilters = {}): Promise<SalesPerformanceReport> {
  const data = await apiRequest<unknown>(`/api/reports/sales-performance${buildQuery(filters)}`, {
    method: "GET",
    cache: "no-store",
  });
  return normalizeSalesPerformance(data);
}

export async function getFuelVarianceReport(filters: ReportFilters = {}): Promise<FuelVarianceReport> {
  const data = await apiRequest<unknown>(`/api/reports/fuel-variance${buildQuery(filters)}`, {
    method: "GET",
    cache: "no-store",
  });
  return normalizeFuelVariance(data);
}

export async function getReceivablesAgingReport(filters: ReportFilters = {}): Promise<ReceivablesAgingReport> {
  const data = await apiRequest<unknown>(`/api/reports/receivables-aging${buildQuery(filters)}`, {
    method: "GET",
    cache: "no-store",
  });
  return normalizeReceivablesAging(data);
}
