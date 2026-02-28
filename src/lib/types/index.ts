export type Role =
  | "super_admin"
  | "admin"
  | "operations_consigner"
  | "operations_vehicles"
  | "sales_vehicles"
  | "sales_consigner"
  | "accounts"
  | "support";

export type TripStage =
  | "request_received"
  | "quoted"
  | "confirmed"
  | "vehicle_assigned"
  | "at_loading"
  | "loaded_docs_ok"
  | "advance_paid"
  | "in_transit"
  | "delivered"
  | "pod_soft_received"
  | "vendor_settled"
  | "customer_collected"
  | "closed";

export const TRIP_STAGE_LABELS: Record<TripStage, string> = {
  request_received: "Request Received",
  quoted: "Quoted",
  confirmed: "Confirmed",
  vehicle_assigned: "Vehicle Assigned",
  at_loading: "At Loading",
  loaded_docs_ok: "Loaded (Docs OK)",
  advance_paid: "Advance Paid",
  in_transit: "In Transit",
  delivered: "Delivered",
  pod_soft_received: "POD Soft Received",
  vendor_settled: "Vendor Settled",
  customer_collected: "Customer Collected",
  closed: "Closed",
};

export const TRIP_STAGES: TripStage[] = [
  "request_received",
  "quoted",
  "confirmed",
  "vehicle_assigned",
  "at_loading",
  "loaded_docs_ok",
  "advance_paid",
  "in_transit",
  "delivered",
  "pod_soft_received",
  "vendor_settled",
  "customer_collected",
  "closed",
];

export interface User {
  id: string;
  fullName: string;
  email: string;
  role: Role;
  active: boolean;
}

export interface Customer {
  id: string;
  name: string;
  address: string;
  gstin: string;
  creditDays: number;
  creditLimit: number;
  salesOwnerId: string;
  salesOwnerName: string;
  active: boolean;
  activeTrips: number;
  outstanding: number;
  lastActivity: string;
}

export interface Vendor {
  id: string;
  name: string;
  kycStatus: "verified" | "pending" | "rejected";
  vehiclesCount: number;
  contactPhone: string;
  notes: string;
}

export interface Vehicle {
  id: string;
  number: string;
  type: string;
  ownershipType: "leased" | "vendor";
  vendorId: string;
  vendorName: string;
  status: "available" | "on_trip" | "maintenance";
  currentTripId: string | null;
}

export interface VehicleMasterLengthOption {
  id: string;
  value: string;
  active: boolean;
}

export interface VehicleMasterTypeOption {
  id: string;
  name: string;
  active: boolean;
  lengths: VehicleMasterLengthOption[];
}

// Per-vehicle policy for leased vehicles (overrides global PolicySettings)
export type RouteTerrain = "plain" | "mixed" | "hilly";

export interface LeasedVehiclePolicy {
  id: string;
  vehicleId: string;
  vehicleNumber: string;
  // Rates
  driverDaPerDay: number;
  vehicleRentPerDay: number;
  // Mileage bands (km/l)
  mileageMin: number;
  mileageMax: number;
  defaultTerrain: RouteTerrain;
  // Fuel
  fuelVarianceThresholdPercent: number;
  // Expense caps
  unofficialGateCap: number;
  dalaKharchaCap: number;
  parkingCap: number;
  // Utilization tracking
  totalTrips: number;
  totalKmRun: number;
  totalRevenue: number;
  totalExpenses: number;
  idleDays: number;
  lastTripDate: string | null;
  updatedAt: string;
}

export interface Trip {
  id: string;
  tripCode: string;
  customerId: string;
  customerName: string;
  pickupLocation: string;
  dropLocation: string;
  route: string;
  currentStage: TripStage;
  leasedFlag: boolean;
  vehicleType: string;
  vehicleLength: string;
  weightEstimate: number;
  plannedKm: number;
  scheduleDate: string;
  tripAmount: number | null;
  requestedById: string;
  requestedByName: string;
  salesOwnerId: string;
  salesOwnerName: string;
  opsOwnerId: string;
  opsOwnerName: string;
  opsVehiclesOwnerId: string;
  opsVehiclesOwnerName: string;
  accountsOwnerId: string;
  accountsOwnerName: string;
  vehicleId: string | null;
  vehicleNumber: string | null;
  driverName: string | null;
  driverPhone: string | null;
  vendorId: string | null;
  vendorName: string | null;
  vendorPhone: string | null;
  startedAt: string | null;
  startedById: string | null;
  completedAt?: string | null;
  completedById?: string | null;
  createdAt: string;
  updatedAt: string;
  internalNotes: string;
}

export interface QuoteVersion {
  id: string;
  tripId: string;
  version: number;
  marketRate: number;
  vendorExpectedCost: number;
  airavatMargin: number;
  customerQuotedPrice: number;
  lowMarginFlag: boolean;
  approved: boolean;
  createdAt: string;
}

export interface TripDocument {
  id: string;
  tripId: string;
  docType: "invoice" | "eway_bill" | "lr" | "pod_soft" | "pod_original";
  status: "pending" | "uploaded" | "verified" | "rejected";
  fileName: string | null;
  uploadedAt: string | null;
  verifiedBy: string | null;
}

export interface PaymentRequest {
  id: string;
  tripId: string;
  tripCode: string;
  type: "advance" | "balance" | "other";
  amount: number;
  beneficiary: string;
  requestedBy: string;
  status: "pending" | "approved" | "on_hold" | "rejected" | "paid";
  proofFileName: string | null;
  paidAt: string | null;
  createdAt: string;
  notes: string;
}

export interface ExpenseEntry {
  id: string;
  tripId: string;
  category: "driver_da" | "vehicle_rent" | "fuel" | "def" | "toll" | "unofficial_gate" | "dala_kharcha" | "repair" | "parking" | "other";
  amount: number;
  capStatus: "within_cap" | "over_cap";
  approvalStatus: "pending" | "approved" | "rejected" | "escalated";
  reason: string;
  receiptUploaded: boolean;
  createdAt: string;
}

export interface OdometerCheckpoint {
  id: string;
  tripId: string;
  checkpointType: "dispatch" | "fuel_stop" | "destination";
  reading: number | null;
  photoUploaded: boolean;
  timestamp: string | null;
  location: string;
}

export interface Ticket {
  id: string;
  tripId: string | null;
  tripCode: string | null;
  issueType: string;
  title: string;
  description: string;
  status: "open" | "in_progress" | "waiting" | "resolved";
  assignedTo: string | null;
  assignedToName: string | null;
  assignedRole?: Role | null;
  createdBy: string;
  createdByName: string;
  resolvedById?: string | null;
  resolvedByName?: string | null;
  resolvedAt?: string | null;
  sourceType?: string | null;
  sourceId?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Receivable {
  id: string;
  customerId: string;
  customerName: string;
  tripId: string;
  tripCode: string;
  amount: number;
  dueDate: string;
  collectedStatus: "pending" | "partial" | "collected" | "overdue";
  followUpStatus: string;
  agingBucket: "0-7" | "8-15" | "16-30" | "30+";
}

export interface AuditLogEntry {
  id: string;
  entity: string;
  entityId: string;
  action: string;
  actorName: string;
  timestamp: string;
  details: string;
}

export interface PolicySettings {
  minimumMarginPercent: number;
  driverDaPerDay: number;
  vehicleRentPerDay: number;
  unofficialGateCap: number;
  dalaKharchaCap: number;
  parkingCap: number;
  podSlaDays: number;
  fuelVarianceThresholdPercent: number;
}

export interface Alert {
  id: string;
  type: "missing_docs" | "pending_approval" | "pod_overdue" | "overdue_receivable" | "fuel_variance" | "sla_breach";
  title: string;
  description: string;
  tripCode: string | null;
  severity: "low" | "medium" | "high";
  createdAt: string;
}

// Sales CRM types
export type LeadStage = "new_enquiry" | "contacted" | "quote_sent" | "negotiation" | "won" | "lost";

export const LEAD_STAGE_LABELS: Record<LeadStage, string> = {
  new_enquiry: "New Enquiry",
  contacted: "Contacted",
  quote_sent: "Quote Sent",
  negotiation: "Negotiation",
  won: "Won",
  lost: "Lost",
};

export const LEAD_STAGES: LeadStage[] = [
  "new_enquiry", "contacted", "quote_sent", "negotiation", "won", "lost",
];

export type LeadSource = "referral" | "website" | "cold_call" | "existing_customer";

export const LEAD_SOURCE_LABELS: Record<LeadSource, string> = {
  referral: "Referral",
  website: "Website",
  cold_call: "Cold Call",
  existing_customer: "Existing Customer",
};

export type LeadPriority = "low" | "medium" | "high";

export interface Lead {
  id: string;
  companyName: string;
  contactPerson: string;
  phone: string;
  email: string;
  source: LeadSource;
  estimatedValue: number;
  route: string;
  vehicleType: string;
  stage: LeadStage;
  priority: LeadPriority;
  notes: string;
  salesOwnerId: string;
  salesOwnerName: string;
  nextFollowUp: string | null;
  convertedCustomerId?: string | null;
  createdAt: string;
  updatedAt: string;
}

export type LeadActivityType = "call" | "email" | "meeting" | "note" | "stage_change";

export interface LeadActivity {
  id: string;
  leadId: string;
  type: LeadActivityType;
  description: string;
  createdBy: string;
  createdAt: string;
}

// Vehicle CRM types (transporter/supply side)
export type VehicleLeadStage = "new_entry" | "contacted" | "docs_pending" | "onboarded" | "rejected";

export const VEHICLE_LEAD_STAGE_LABELS: Record<VehicleLeadStage, string> = {
  new_entry: "New Entry",
  contacted: "Contacted",
  docs_pending: "Docs",
  onboarded: "Onboarded",
  rejected: "Rejected",
};

export const VEHICLE_LEAD_STAGES: VehicleLeadStage[] = [
  "new_entry", "contacted", "docs_pending", "onboarded", "rejected",
];

export interface VehicleLead {
  id: string;
  driverName: string;
  mobile: string;
  alternateContact: string;
  ownerName: string;
  ownerContact: string;
  isOwnerCumDriver: boolean;
  currentAddress: string;
  permanentAddress: string;
  preferredRoute: string;
  vehicleType: string;
  vehicleLength: string;
  vehicleCapacity: string;
  vehicleRegistration: string;
  marketRate: number;
  stage: VehicleLeadStage;
  remarks: string;
  addedById: string;
  addedByName: string;
  nextFollowUp: string | null;
  convertedVendorId?: string | null;
  createdAt: string;
  updatedAt: string;
}

export type VehicleLeadActivityType = "call" | "whatsapp" | "meeting" | "note" | "stage_change" | "doc_upload";

export interface VehicleLeadActivity {
  id: string;
  vehicleLeadId: string;
  type: VehicleLeadActivityType;
  description: string;
  createdBy: string;
  createdAt: string;
}

export type RateStatus = "pending" | "approved" | "rejected";

export type RateCategory = "ftl" | "ptl" | "odc" | "container" | "express";

export const RATE_CATEGORY_LABELS: Record<RateCategory, string> = {
  ftl: "FTL (Full Truck Load)",
  ptl: "PTL (Part Truck Load)",
  odc: "ODC (Over Dimensional Cargo)",
  container: "Container",
  express: "Express",
};

export interface MarketRate {
  id: string;
  fromLocation: string;
  toLocation: string;
  vehicleType: string;
  rateCategory: RateCategory;
  freightRate: number;
  ratePerTon: number | null;
  ratePerKg: number | null;
  confidenceLevel: "low" | "medium" | "high" | null;
  source: string | null;
  remarks: string | null;
  submittedBy: string;
  submittedByName: string;
  reviewedBy: string | null;
  reviewedByName: string | null;
  status: RateStatus;
  createdAt: string;
  reviewedAt: string | null;
}

export interface RateComment {
  id: string;
  rateId: string;
  commentText: string;
  createdById: string;
  createdByName: string;
  createdAt: string;
  updatedAt?: string | null;
}

export type RateRequestStatus = "open" | "fulfilled" | "cancelled";

export type RateRequestQuoteStatus = "pending_review" | "approved" | "rejected";

export interface RateRequest {
  id: string;
  fromLocation: string;
  toLocation: string;
  vehicleType: string;
  vehicleTypeId: string;
  rateCategory: RateCategory;
  notes: string | null;
  status: RateRequestStatus;
  requestedById: string;
  requestedByName: string;
  requestedByRole: Role;
  publishedRateId: string | null;
  fulfilledAt: string | null;
  createdAt: string;
  updatedAt: string;
  latestQuoteId: string | null;
  latestQuoteStatus: RateRequestQuoteStatus | null;
  latestFreightRate: number | null;
  latestQuotedById: string | null;
  latestQuotedByName: string | null;
  latestQuotedAt: string | null;
}

export interface RateRequestQuote {
  id: string;
  rateRequestId: string;
  freightRate: number;
  ratePerTon: number | null;
  ratePerKg: number | null;
  confidenceLevel: "low" | "medium" | "high" | null;
  source: string | null;
  remarks: string | null;
  status: RateRequestQuoteStatus;
  quotedById: string;
  quotedByName: string;
  reviewedById: string | null;
  reviewedByName: string | null;
  reviewRemarks: string | null;
  publishedRateId: string | null;
  reviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
}
