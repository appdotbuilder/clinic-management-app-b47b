import { serial, text, pgTable, timestamp, boolean, integer, numeric, pgEnum } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// User role enum
export const userRoleEnum = pgEnum('user_role', ['admin', 'doctor', 'receptionist']);

// Users table
export const usersTable = pgTable('users', {
  id: serial('id').primaryKey(),
  username: text('username').notNull().unique(),
  password_hash: text('password_hash').notNull(),
  full_name: text('full_name').notNull(),
  role: userRoleEnum('role').notNull(),
  is_active: boolean('is_active').notNull().default(true),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull(),
});

// Patients table
export const patientsTable = pgTable('patients', {
  id: serial('id').primaryKey(),
  medical_record_number: text('medical_record_number').notNull().unique(),
  full_name: text('full_name').notNull(),
  phone_number: text('phone_number').notNull(),
  address: text('address').notNull(),
  date_of_birth: timestamp('date_of_birth').notNull(),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull(),
});

// Doctors table
export const doctorsTable = pgTable('doctors', {
  id: serial('id').primaryKey(),
  user_id: integer('user_id').notNull().references(() => usersTable.id),
  specialization: text('specialization').notNull(),
  practice_schedule: text('practice_schedule').notNull(), // JSON string
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull(),
});

// Medical records table
export const medicalRecordsTable = pgTable('medical_records', {
  id: serial('id').primaryKey(),
  patient_id: integer('patient_id').notNull().references(() => patientsTable.id),
  doctor_id: integer('doctor_id').notNull().references(() => doctorsTable.id),
  visit_date: timestamp('visit_date').notNull(),
  diagnosis: text('diagnosis').notNull(),
  prescription: text('prescription').notNull(),
  notes: text('notes'), // Nullable field
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull(),
});

// Payments table
export const paymentsTable = pgTable('payments', {
  id: serial('id').primaryKey(),
  patient_id: integer('patient_id').notNull().references(() => patientsTable.id),
  medical_record_id: integer('medical_record_id').references(() => medicalRecordsTable.id), // Nullable
  cashier_id: integer('cashier_id').notNull().references(() => usersTable.id),
  doctor_service_fee: numeric('doctor_service_fee', { precision: 10, scale: 2 }).notNull(),
  medicine_fee: numeric('medicine_fee', { precision: 10, scale: 2 }).notNull(),
  total_amount: numeric('total_amount', { precision: 10, scale: 2 }).notNull(),
  payment_date: timestamp('payment_date').defaultNow().notNull(),
  receipt_number: text('receipt_number').notNull().unique(),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull(),
});

// Relations
export const usersRelations = relations(usersTable, ({ one, many }) => ({
  doctor: one(doctorsTable, {
    fields: [usersTable.id],
    references: [doctorsTable.user_id],
  }),
  cashierPayments: many(paymentsTable, { relationName: 'cashierPayments' }),
}));

export const patientsRelations = relations(patientsTable, ({ many }) => ({
  medicalRecords: many(medicalRecordsTable),
  payments: many(paymentsTable),
}));

export const doctorsRelations = relations(doctorsTable, ({ one, many }) => ({
  user: one(usersTable, {
    fields: [doctorsTable.user_id],
    references: [usersTable.id],
  }),
  medicalRecords: many(medicalRecordsTable),
}));

export const medicalRecordsRelations = relations(medicalRecordsTable, ({ one, many }) => ({
  patient: one(patientsTable, {
    fields: [medicalRecordsTable.patient_id],
    references: [patientsTable.id],
  }),
  doctor: one(doctorsTable, {
    fields: [medicalRecordsTable.doctor_id],
    references: [doctorsTable.id],
  }),
  payments: many(paymentsTable),
}));

export const paymentsRelations = relations(paymentsTable, ({ one }) => ({
  patient: one(patientsTable, {
    fields: [paymentsTable.patient_id],
    references: [patientsTable.id],
  }),
  medicalRecord: one(medicalRecordsTable, {
    fields: [paymentsTable.medical_record_id],
    references: [medicalRecordsTable.id],
  }),
  cashier: one(usersTable, {
    fields: [paymentsTable.cashier_id],
    references: [usersTable.id],
    relationName: 'cashierPayments',
  }),
}));

// TypeScript types for the table schemas
export type User = typeof usersTable.$inferSelect;
export type NewUser = typeof usersTable.$inferInsert;
export type Patient = typeof patientsTable.$inferSelect;
export type NewPatient = typeof patientsTable.$inferInsert;
export type Doctor = typeof doctorsTable.$inferSelect;
export type NewDoctor = typeof doctorsTable.$inferInsert;
export type MedicalRecord = typeof medicalRecordsTable.$inferSelect;
export type NewMedicalRecord = typeof medicalRecordsTable.$inferInsert;
export type Payment = typeof paymentsTable.$inferSelect;
export type NewPayment = typeof paymentsTable.$inferInsert;

// Export all tables and relations for proper query building
export const tables = {
  users: usersTable,
  patients: patientsTable,
  doctors: doctorsTable,
  medicalRecords: medicalRecordsTable,
  payments: paymentsTable,
};