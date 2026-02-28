export const queryKeys = {
  adminUsers: ["admin-users"] as const,
  adminUser: (userId: string) => ["admin-user", userId] as const,
  adminVehicleMaster: ["admin-vehicle-master"] as const,
  vehicleMasterOptions: ["vehicle-master-options"] as const,
  customers: (filters: {
    search?: string;
    status?: string;
    ownerId?: string;
    creditHealth?: string;
  }) => ["customers", "list", filters] as const,
  customer: (customerId: string) => ["customers", "detail", customerId] as const,
  customerTrips: (customerId: string, paging?: { limit?: number; offset?: number }) =>
    ["customers", "trips", customerId, paging ?? {}] as const,
  customerReceivables: (customerId: string, paging?: { limit?: number; offset?: number }) =>
    ["customers", "receivables", customerId, paging ?? {}] as const,
  fleetVehicles: (filters: {
    search?: string;
    status?: string;
    ownershipKind?: string;
    vehicleType?: string;
  }) =>
    ["fleet", "vehicles", filters] as const,
  fleetVendors: (filters: { search?: string; vendorKind?: string; vehicleType?: string }) =>
    ["fleet", "vendors", filters] as const,
  fleetVendor: (vendorId: string) => ["fleet", "vendor", vendorId] as const,
  fleetVendorDrivers: (vendorId: string, filters?: { search?: string }) =>
    ["fleet", "vendor", vendorId, "drivers", filters ?? {}] as const,
  fleetVendorVehicles: (vendorId: string, filters?: { search?: string }) =>
    ["fleet", "vendor", vendorId, "vehicles", filters ?? {}] as const,
  approvedRates: (filters: {
    search: string;
    vehicleType: string;
    category: string;
  }) => ["rates", "approved", filters] as const,
  reviewRates: (filters: { status: string }) => ["rates", "review", filters] as const,
  rateById: (rateId: string) => ["rate", rateId] as const,
  rateComments: (rateId: string) => ["rate-comments", rateId] as const,
  rateRequests: (filters: { status?: string; search?: string; limit?: number; offset?: number }) =>
    ["rate-requests", "list", filters] as const,
  rateRequest: (requestId: string) => ["rate-requests", "detail", requestId] as const,
  rateRequestQuotes: (requestId: string) => ["rate-requests", "quotes", requestId] as const,
  vehicleCrmLeads: (filters: { view: "board" | "list"; stage?: string; search?: string; vehicleType?: string }) =>
    ["vehicle-crm", "leads", filters] as const,
  vehicleCrmLead: (leadId: string) => ["vehicle-crm", "lead", leadId] as const,
  vehicleCrmLeadActivities: (leadId: string) => ["vehicle-crm", "lead", leadId, "activities"] as const,
  consignerCrmLeads: (filters: { view: "board" | "list"; stage?: string; search?: string; priority?: string }) =>
    ["consigner-crm", "leads", filters] as const,
  consignerCrmLead: (leadId: string) => ["consigner-crm", "lead", leadId] as const,
  consignerCrmLeadActivities: (leadId: string) => ["consigner-crm", "lead", leadId, "activities"] as const,
  leasedVehicles: (filters: { search?: string; status?: string }) =>
    ["leased-vehicles", "list", filters] as const,
  leasedVehicle: (id: string) => ["leased-vehicles", "detail", id] as const,
  vendors: (filters: { search?: string }) => ["vendors", "list", filters] as const,
  trips: (filters: { search?: string; stage?: string }) =>
    ["trips", "list", filters] as const,
  tripHistory: (filters: { search?: string; fromDate?: string; toDate?: string }) =>
    ["trips", "history", filters] as const,
  trip: (id: string) => ["trips", "detail", id] as const,
  tripPaymentRequests: (tripId: string) => ["trips", "payment-requests", tripId] as const,
  tripPaymentSummary: (tripId: string) => ["trips", "payment-summary", tripId] as const,
  tripLoadingProofs: (tripId: string) => ["trips", "loading-proofs", tripId] as const,
  tripTimeline: (tripId: string) => ["trips", "timeline", tripId] as const,
  paymentsQueue: (filters: { search?: string; status?: string; type?: string }) => ["payments", "queue", filters] as const,
  reportOverview: (filters: { fromDate?: string; toDate?: string; ownerId?: string; vehicleType?: string }) =>
    ["reports", "overview", filters] as const,
  reportTripPnl: (filters: { fromDate?: string; toDate?: string; ownerId?: string; vehicleType?: string }) =>
    ["reports", "trip-pnl", filters] as const,
  reportFuelVariance: (filters: { fromDate?: string; toDate?: string; ownerId?: string; vehicleType?: string }) =>
    ["reports", "fuel-variance", filters] as const,
  reportExpenseSummary: (filters: { fromDate?: string; toDate?: string; ownerId?: string; vehicleType?: string }) =>
    ["reports", "expense-summary", filters] as const,
  reportUtilization: (filters: { fromDate?: string; toDate?: string; ownerId?: string; vehicleType?: string }) =>
    ["reports", "utilization", filters] as const,
  reportSalesPerformance: (filters: { fromDate?: string; toDate?: string; ownerId?: string; vehicleType?: string }) =>
    ["reports", "sales-performance", filters] as const,
  reportReceivablesAging: (filters: { fromDate?: string; toDate?: string; ownerId?: string; vehicleType?: string }) =>
    ["reports", "receivables-aging", filters] as const,
  tickets: (filters: { search?: string; status?: string; limit?: number; offset?: number }) =>
    ["tickets", "list", filters] as const,
  availableVehicles: (filters: { vehicleType?: string; search?: string }) =>
    ["trips", "available-vehicles", filters] as const,
  opsVehiclesUsers: ["trips", "ops-vehicles-users"] as const,
};
