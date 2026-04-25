export const queryKeys = {
  adminUsers: ["admin-users"] as const,
  adminUsersDeleted: ["admin-users", "deleted"] as const,
  adminUser: (userId: string) => ["admin-user", userId] as const,
  adminVehicleMaster: (includeInactive?: boolean) => ["admin-vehicle-master", { includeInactive }] as const,
  vehicleMasterOptions: ["vehicle-master-options"] as const,
  customers: (filters: {
    search?: string;
    status?: string;
    ownerId?: string;
    creditHealth?: string;
  }) => ["customers", "list", filters] as const,
  appConsigners: (filters: { search?: string; limit?: number; offset?: number }) =>
    ["customers", "app-consigners", filters] as const,
  customer: (customerId: string) => ["customers", "detail", customerId] as const,
  customerTrips: (customerId: string, paging?: { limit?: number; offset?: number }) =>
    ["customers", "trips", customerId, paging ?? {}] as const,
  customerReceivables: (customerId: string, paging?: { limit?: number; offset?: number }) =>
    ["customers", "receivables", customerId, paging ?? {}] as const,
  customerPortalUsers: (customerId: string) =>
    ["customers", "portal-users", customerId] as const,
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
  verificationPending: (filters: { userType?: string; search?: string; limit?: number; offset?: number }) =>
    ["verification", "pending", filters] as const,
  verificationDetail: (userId: string) => ["verification", "detail", userId] as const,
  transporterFleet: (userId: string) => ["verification", "transporter-fleet", userId] as const,
  vehicleVerification: (vehicleId: string) => ["verification", "vehicle", vehicleId] as const,
  employeeDriverVerification: (driverId: string) => ["verification", "employee-driver", driverId] as const,
  deliveryRequests: (filters: {
    search?: string;
    status?: string;
    source?: string;
    limit?: number;
    offset?: number;
  }) => ["delivery-requests", "list", filters] as const,
  deliveryRequest: (requestId: string) =>
    ["delivery-requests", "detail", requestId] as const,
  deliveryRequestConsigners: (search?: string) =>
    ["delivery-requests", "consigners", search ?? ""] as const,
  platformSetting: (key: string) =>
    ["platform-settings", key] as const,
  platformFees: ["platform-fees"] as const,
  consignerCrmLeads: (filters: { view: "board" | "list"; stage?: string; search?: string; priority?: string }) =>
    ["consigner-crm", "leads", filters] as const,
  consignerCrmLead: (leadId: string) => ["consigner-crm", "lead", leadId] as const,
  consignerCrmLeadActivities: (leadId: string) => ["consigner-crm", "lead", leadId, "activities"] as const,
  fleetAppUsers: (filters: { userType?: string; search?: string; limit?: number; offset?: number }) =>
    ["fleet", "app-users", filters] as const,
  vendors: (filters: { search?: string }) => ["vendors", "list", filters] as const,
  trips: (filters: { search?: string; status?: string; limit?: number; offset?: number }) =>
    ["trips", "list", filters] as const,
  tripHistory: (filters: { search?: string; limit?: number; offset?: number }) =>
    ["trips", "history", filters] as const,
  trip: (id: string) => ["trips", "detail", id] as const,
  tripPaymentRequests: (tripId: string) => ["trips", "payment-requests", tripId] as const,
  tripPaymentSummary: (tripId: string) => ["trips", "payment-summary", tripId] as const,
  tripLoadingProofs: (tripId: string) => ["trips", "loading-proofs", tripId] as const,
  tripTimeline: (tripId: string) => ["trips", "timeline", tripId] as const,
  tripDriverLocation: (tripId: string) => ["trips", "driver-location", tripId] as const,
  tripHoldingCharges: (tripId: string) => ["trips", "holding-charges", tripId] as const,
  reportsAnalytics: (filters: { from?: string; to?: string }) =>
    ["reports", "analytics", filters] as const,
  paymentsQueue: (filters: { search?: string; status?: string; type?: string }) => ["payments", "queue", filters] as const,
  paymentProofUpload: (paymentRequestId: string) => ["payments", "proof-upload", paymentRequestId] as const,
  receivableCollectionProof: (receivableId: string) => ["receivables", "proof-upload", "single", receivableId] as const,
  receivableBulkCollectionProof: (consignerProfileId: string) => ["receivables", "proof-upload", "bulk", consignerProfileId] as const,
  appOverview: (filters: { from?: string; to?: string }) =>
    ["reports", "app-overview", filters] as const,
  appAuctions: (filters: { status?: string; requestType?: string; search?: string; limit?: number; offset?: number }) =>
    ["reports", "app-auctions", filters] as const,
  appTrips: (filters: { status?: string; search?: string; limit?: number; offset?: number }) =>
    ["reports", "app-trips", filters] as const,
  appPayments: (filters: { status?: string; paymentType?: string; search?: string; limit?: number; offset?: number }) =>
    ["reports", "app-payments", filters] as const,
  appPayouts: (filters: { status?: string; limit?: number; offset?: number }) =>
    ["reports", "app-payouts", filters] as const,
  appCustomers: (filters: { search?: string; active?: boolean; creditHealth?: string; limit?: number; offset?: number }) =>
    ["reports", "app-customers", filters] as const,
  appDriverLocations: (filters: { onlineOnly?: boolean }) =>
    ["reports", "app-driver-locations", filters] as const,
  tickets: (filters: { search?: string; status?: string; limit?: number; offset?: number }) =>
    ["tickets", "list", filters] as const,
  availableVehicles: (filters: { vehicleType?: string; search?: string }) =>
    ["trips", "available-vehicles", filters] as const,
  opsVehiclesUsers: ["trips", "ops-vehicles-users"] as const,
};
