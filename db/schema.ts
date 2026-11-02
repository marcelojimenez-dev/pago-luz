// Intentionally empty by default.
// Add Drizzle tables here when the site actually needs a database.
// See examples/d1/db/schema.ts for an opt-in example.
export {};
import { integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull(),
  displayName: text("display_name").notNull(),
  createdAt: text("created_at").notNull(),
});

export const communities = sqliteTable("communities", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  utilityClientNumber: text("utility_client_number"),
  createdAt: text("created_at").notNull(),
});

export const communityMembers = sqliteTable(
  "community_members",
  {
    id: text("id").primaryKey(),
    communityId: text("community_id").notNull().references(() => communities.id),
    userId: text("user_id").notNull().references(() => users.id),
    role: text("role", { enum: ["admin", "reader", "treasurer", "auditor", "resident"] }).notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [uniqueIndex("community_member_unique").on(table.communityId, table.userId)],
);

export const properties = sqliteTable(
  "properties",
  {
    id: text("id").primaryKey(),
    communityId: text("community_id").notNull().references(() => communities.id),
    parcelNumber: text("parcel_number").notNull(),
    ownerLabel: text("owner_label").notNull(),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    createdAt: text("created_at").notNull(),
  },
  (table) => [uniqueIndex("property_parcel_unique").on(table.communityId, table.parcelNumber)],
);

export const propertyMembers = sqliteTable(
  "property_members",
  {
    id: text("id").primaryKey(),
    propertyId: text("property_id").notNull().references(() => properties.id),
    userId: text("user_id").notNull().references(() => users.id),
    createdAt: text("created_at").notNull(),
  },
  (table) => [uniqueIndex("property_member_unique").on(table.propertyId, table.userId)],
);

export const meters = sqliteTable(
  "meters",
  {
    id: text("id").primaryKey(),
    communityId: text("community_id").notNull().references(() => communities.id),
    propertyId: text("property_id").references(() => properties.id),
    serialNumber: text("serial_number").notNull(),
    label: text("label").notNull(),
    kind: text("kind", { enum: ["parcel", "well", "master"] }).notNull(),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    createdAt: text("created_at").notNull(),
  },
  (table) => [uniqueIndex("meter_serial_unique").on(table.communityId, table.serialNumber)],
);

export const billingPeriods = sqliteTable("billing_periods", {
  id: text("id").primaryKey(),
  communityId: text("community_id").notNull().references(() => communities.id),
  name: text("name").notNull(),
  startDate: text("start_date").notNull(),
  endDate: text("end_date").notNull(),
  dueDate: text("due_date").notNull(),
  invoiceNumber: text("invoice_number"),
  status: text("status", { enum: ["open", "review", "published", "closed"] }).notNull(),
  utilityTotal: integer("utility_total").notNull(),
  readingServiceTotal: integer("reading_service_total").notNull(),
  energyPool: integer("energy_pool").notNull(),
  peakPool: integer("peak_pool").notNull(),
  maintenanceFundPerProperty: integer("maintenance_fund_per_property").notNull(),
  masterKwh: integer("master_kwh").notNull(),
  createdAt: text("created_at").notNull(),
});

export const meterReadings = sqliteTable(
  "meter_readings",
  {
    id: text("id").primaryKey(),
    meterId: text("meter_id").notNull().references(() => meters.id),
    periodId: text("period_id").notNull().references(() => billingPeriods.id),
    previousValue: integer("previous_value").notNull(),
    currentValue: integer("current_value").notNull(),
    consumptionKwh: integer("consumption_kwh").notNull(),
    status: text("status", { enum: ["submitted", "approved", "rejected"] }).notNull(),
    capturedAt: text("captured_at").notNull(),
    submittedBy: text("submitted_by").notNull().references(() => users.id),
    approvedBy: text("approved_by").references(() => users.id),
    notes: text("notes"),
    createdAt: text("created_at").notNull(),
  },
  (table) => [uniqueIndex("meter_period_reading_unique").on(table.meterId, table.periodId)],
);

export const readingPhotos = sqliteTable("reading_photos", {
  id: text("id").primaryKey(),
  readingId: text("reading_id").notNull().references(() => meterReadings.id),
  objectKey: text("object_key").notNull().unique(),
  mimeType: text("mime_type").notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  sha256: text("sha256").notNull(),
  createdAt: text("created_at").notNull(),
});

export const balances = sqliteTable(
  "balances",
  {
    id: text("id").primaryKey(),
    propertyId: text("property_id").notNull().references(() => properties.id),
    periodId: text("period_id").notNull().references(() => billingPeriods.id),
    amount: integer("amount").notNull(),
    description: text("description").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [uniqueIndex("balance_property_period_unique").on(table.propertyId, table.periodId)],
);

export const statements = sqliteTable(
  "statements",
  {
    id: text("id").primaryKey(),
    periodId: text("period_id").notNull().references(() => billingPeriods.id),
    propertyId: text("property_id").notNull().references(() => properties.id),
    consumptionKwh: integer("consumption_kwh").notNull(),
    energyCharge: integer("energy_charge").notNull(),
    peakCharge: integer("peak_charge").notNull(),
    sharedCharge: integer("shared_charge").notNull(),
    maintenanceFund: integer("maintenance_fund").notNull(),
    previousBalance: integer("previous_balance").notNull(),
    roundingAdjustment: integer("rounding_adjustment").notNull(),
    total: integer("total").notNull(),
    status: text("status", { enum: ["draft", "published", "paid"] }).notNull(),
    calculatedAt: text("calculated_at").notNull(),
  },
  (table) => [uniqueIndex("statement_property_period_unique").on(table.propertyId, table.periodId)],
);

export const auditLog = sqliteTable("audit_log", {
  id: text("id").primaryKey(),
  communityId: text("community_id").notNull().references(() => communities.id),
  userId: text("user_id").notNull().references(() => users.id),
  action: text("action").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id").notNull(),
  payload: text("payload").notNull(),
  createdAt: text("created_at").notNull(),
});
