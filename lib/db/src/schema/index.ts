import {
  boolean,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

export const roleEnum = pgEnum("usagi_role", ["USER", "ADMIN"]);
export const accountStatusEnum = pgEnum("usagi_account_status", ["PENDING", "APPROVED", "REJECTED"]);
export const orderStatusEnum = pgEnum("usagi_order_status", ["PENDING", "ACCEPTED", "DRAWING", "COMPLETED", "REJECTED"]);

export const usersTable = pgTable("usagi_users", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  fullName: text("full_name").notNull(),
  className: text("class_name"),
  contact: text("contact"),
  role: roleEnum("role").notNull().default("USER"),
  status: accountStatusEnum("status").notNull().default("PENDING"),
  adminNote: text("admin_note"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const sessionsTable = pgTable("usagi_sessions", {
  id: text("id").primaryKey(),
  userId: uuid("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const packagesTable = pgTable("usagi_packages", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  price: integer("price").notNull(),
  maximumOrders: integer("maximum_orders").notNull(),
  currentOrders: integer("current_orders").notNull().default(0),
  isOpen: boolean("is_open").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const ordersTable = pgTable("usagi_orders", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => usersTable.id, { onDelete: "restrict" }),
  packageId: integer("package_id").notNull().references(() => packagesTable.id, { onDelete: "restrict" }),
  status: orderStatusEnum("status").notNull().default("PENDING"),
  subject: text("subject").notNull(),
  artType: text("art_type").notNull(),
  style: text("style").notNull(),
  size: text("size").notNull(),
  colors: text("colors").notNull(),
  description: text("description").notNull(),
  purpose: text("purpose"),
  addText: boolean("add_text").notNull().default(false),
  addedText: text("added_text"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const orderImagesTable = pgTable("usagi_order_images", {
  id: serial("id").primaryKey(),
  orderId: uuid("order_id").notNull().references(() => ordersTable.id, { onDelete: "cascade" }),
  objectKey: text("object_key").notNull(),
  originalName: text("original_name").notNull(),
  contentType: text("content_type").notNull(),
  byteSize: integer("byte_size").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const orderNotesTable = pgTable("usagi_order_notes", {
  id: serial("id").primaryKey(),
  orderId: uuid("order_id").notNull().references(() => ordersTable.id, { onDelete: "cascade" }),
  adminId: uuid("admin_id").notNull().references(() => usersTable.id, { onDelete: "restrict" }),
  body: text("body").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const auditLogsTable = pgTable("usagi_audit_logs", {
  id: serial("id").primaryKey(),
  actorId: uuid("actor_id").references(() => usersTable.id, { onDelete: "set null" }),
  action: text("action").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id"),
  details: jsonb("details").$type<Record<string, unknown> | null>(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});