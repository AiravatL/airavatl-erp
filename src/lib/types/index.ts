export type Role =
  | "super_admin"
  | "admin"
  | "operations"
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

export interface VehicleMasterVehicle {
  id: string;
  capacityTons: number;
  lengthFeet: number | null;
  bodyType: string;
  wheelCount: number | null;
  name: string;
  code: string;
  active: boolean;
  displayOrder: number;
}

export interface VehicleMasterSegment {
  id: string;
  bodyType: string;
  label: string;
  weightMinKg: number;
  weightMaxKg: number | null;
  active: boolean;
  displayOrder: number;
}

export interface VehicleMasterCatalog {
  vehicles: VehicleMasterVehicle[];
  segments: VehicleMasterSegment[];
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
  pickupPoints: string[];
  dropPoints: string[];
  route: string;
  currentStage: TripStage;
  leasedFlag: boolean;
  vehicleType: string;
  vehicleLength: string;
  weightEstimate: number;
  plannedKm: number;
  scheduleDate: string;
  tripAmount: number | null;
  materialDetails: string;
  materialLength: string;
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

export type LeadSource = "referral" | "website" | "cold_call" | "existing_customer" | "field_visit";

export const LEAD_SOURCE_LABELS: Record<LeadSource, string> = {
  referral: "Referral",
  website: "Website",
  cold_call: "Cold Call",
  existing_customer: "Existing Customer",
  field_visit: "Field Visit",
};

export type LeadPriority = "low" | "medium" | "high";

export interface Lead {
  id: string;
  companyName: string;
  companyAddress: string;
  contactPerson: string;
  contactPersonDesignation: string;
  natureOfBusiness: string;
  phone: string;
  email: string;
  source: LeadSource;
  estimatedValue: number;
  route: string;
  vehicleType: string;
  vehicleRequirements: string[];
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

// Partner Verification types
export type PartnerUserType = "individual_driver" | "transporter";
export type VerificationUploadDocType = "rc" | "dl" | "aadhaar" | "transport_license";
export type VerificationUploadStatus =
  | "prepared"
  | "uploaded"
  | "attached"
  | "expired"
  | "missing";
export type VerificationUploadSource = "draft" | "final" | "none";

export interface VerificationUploadSummary {
  docType: VerificationUploadDocType;
  status: VerificationUploadStatus;
  objectKey: string | null;
  fileName: string | null;
  mimeType: string | null;
  fileSizeBytes: number | null;
  uploadedAt: string | null;
  attachedAt: string | null;
  source: VerificationUploadSource;
}

export interface PendingPartner {
  userId: string;
  fullName: string;
  phone: string;
  userType: PartnerUserType;
  city: string | null;
  state: string | null;
  createdAt: string;
}

export interface VerificationDetails {
  user: {
    id: string;
    fullName: string;
    phone: string;
    userType: PartnerUserType;
    city: string | null;
    state: string | null;
    isVerified: boolean;
    createdAt: string;
  };
  driver: {
    id: string;
    licenseNumber: string | null;
    licenseExpiryDate: string | null;
    licensePhotoUrl: string | null;
    aadharNumber: string | null;
    aadharPhotoUrl: string | null;
    bankAccountNumber: string | null;
    bankIfscCode: string | null;
    bankAccountHolderName: string | null;
    upiId: string | null;
    isDocumentsVerified: boolean;
    verificationNotes: string | null;
    verifiedAt: string | null;
    verifiedBy: string | null;
  } | null;
  transporter: {
    id: string;
    organizationName: string;
    transportLicenseNumber: string | null;
    transportLicenseExpiry: string | null;
    licensePhotoUrl: string | null;
    aadharNumber: string | null;
    aadharPhotoUrl: string | null;
    gstNumber: string | null;
    panNumber: string | null;
    bankAccountNumber: string | null;
    bankIfscCode: string | null;
    bankAccountHolderName: string | null;
    upiId: string | null;
    isDocumentsVerified: boolean;
    verificationNotes: string | null;
    verifiedAt: string | null;
    verifiedBy: string | null;
  } | null;
  vehicle: {
    id: string;
    registrationNumber: string;
    registrationCertificateUrl: string | null;
    vehicleType: string;
    isVerified: boolean;
  } | null;
  uploads: Partial<Record<VerificationUploadDocType, VerificationUploadSummary | null>>;
}

export interface SubmitDriverVerificationInput {
  licenseNumber: string;
  licenseExpiryDate?: string;
  dlPhotoKey?: string;
  aadharNumber: string;
  aadharPhotoKey?: string;
  registrationNumber: string;
  vehicleType: string;
  rcPhotoKey?: string;
  bankAccountNumber: string;
  bankIfscCode: string;
  bankAccountHolderName: string;
  upiId?: string;
  notes?: string;
}

export interface SubmitTransporterVerificationInput {
  transportLicenseNumber: string;
  transportLicenseExpiry?: string;
  licensePhotoKey?: string;
  aadharNumber: string;
  aadharPhotoKey?: string;
  bankAccountNumber: string;
  bankIfscCode: string;
  bankAccountHolderName: string;
  upiId?: string;
  gstNumber?: string;
  panNumber?: string;
  notes?: string;
}

export type SubmitVerificationInput = SubmitDriverVerificationInput | SubmitTransporterVerificationInput;

// Delivery Request / Auction types
export type DeliveryRequestStatus =
  | "draft"
  | "active"
  | "ended"
  | "winner_selected"
  | "trip_created"
  | "completed"
  | "cancelled"
  | "incomplete";

export type VehicleTypeRequired =
  | "three_wheeler"
  | "pickup_truck"
  | "mini_truck"
  | "medium_truck"
  | "large_truck"
  | "tata_ace"
  | "tempo"
  | "container_truck"
  | "trailer";

export const VEHICLE_TYPE_LABELS: Record<VehicleTypeRequired, string> = {
  three_wheeler: "3 Wheeler",
  pickup_truck: "Pickup Truck",
  mini_truck: "Mini Truck",
  medium_truck: "Medium Truck",
  large_truck: "Large Truck",
  tata_ace: "Tata Ace",
  tempo: "Tempo",
  container_truck: "Container Truck",
  trailer: "Trailer",
};

export type CargoType = "general" | "fragile" | "perishable" | "hazardous" | "valuable";

export const CARGO_TYPE_LABELS: Record<CargoType, string> = {
  general: "General",
  fragile: "Fragile",
  perishable: "Perishable",
  hazardous: "Hazardous",
  valuable: "Valuable",
};

export const DELIVERY_REQUEST_STATUS_LABELS: Record<DeliveryRequestStatus, string> = {
  draft: "Draft",
  active: "Active",
  ended: "Ended",
  winner_selected: "Winner Selected",
  trip_created: "Trip Created",
  completed: "Completed",
  cancelled: "Cancelled",
  incomplete: "Incomplete",
};

export interface SelectWinnerResult {
  trip_id: string;
  trip_number: string;
  pickup_otp: string;
  bid_amount: number;
  consigner_trip_amount: number;
}

export interface TripMetadata {
  consigner_trip_amount: number;
  selected_by_admin_id: string;
  selected_by_name: string | null;
}

export type AuctionSource = "erp" | "app";

export type AppTripStatus =
  | "pending"
  | "waiting_driver_acceptance"
  | "driver_assigned"
  | "en_route_to_pickup"
  | "at_pickup"
  | "loading"
  | "in_transit"
  | "at_delivery"
  | "unloading"
  | "completed"
  | "cancelled"
  | "driver_rejected";

export const APP_TRIP_STATUS_LABELS: Record<AppTripStatus, string> = {
  pending: "Pending",
  waiting_driver_acceptance: "Waiting Driver",
  driver_assigned: "Driver Assigned",
  en_route_to_pickup: "En Route to Pickup",
  at_pickup: "At Pickup",
  loading: "Loading",
  in_transit: "In Transit",
  at_delivery: "At Delivery",
  unloading: "Unloading",
  completed: "Completed",
  cancelled: "Cancelled",
  driver_rejected: "Driver Rejected",
};

export const AUCTION_DURATION_OPTIONS = [
  { value: 15, label: "15 minutes" },
  { value: 30, label: "30 minutes" },
  { value: 60, label: "1 hour" },
  { value: 120, label: "2 hours" },
  { value: 240, label: "4 hours" },
  { value: 480, label: "8 hours" },
  { value: 720, label: "12 hours" },
  { value: 1440, label: "24 hours" },
] as const;

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
