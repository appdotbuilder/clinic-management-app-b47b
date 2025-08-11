import { z } from 'zod';

// User role enum
export const userRoleSchema = z.enum(['admin', 'doctor', 'receptionist']);
export type UserRole = z.infer<typeof userRoleSchema>;

// User schema
export const userSchema = z.object({
  id: z.number(),
  username: z.string(),
  password_hash: z.string(),
  full_name: z.string(),
  role: userRoleSchema,
  is_active: z.boolean(),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date()
});

export type User = z.infer<typeof userSchema>;

// Patient schema
export const patientSchema = z.object({
  id: z.number(),
  medical_record_number: z.string(),
  full_name: z.string(),
  phone_number: z.string(),
  address: z.string(),
  date_of_birth: z.coerce.date(),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date()
});

export type Patient = z.infer<typeof patientSchema>;

// Doctor schema
export const doctorSchema = z.object({
  id: z.number(),
  user_id: z.number(),
  specialization: z.string(),
  practice_schedule: z.string(), // JSON string containing schedule data
  created_at: z.coerce.date(),
  updated_at: z.coerce.date()
});

export type Doctor = z.infer<typeof doctorSchema>;

// Medical record schema
export const medicalRecordSchema = z.object({
  id: z.number(),
  patient_id: z.number(),
  doctor_id: z.number(),
  visit_date: z.coerce.date(),
  diagnosis: z.string(),
  prescription: z.string(),
  notes: z.string().nullable(),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date()
});

export type MedicalRecord = z.infer<typeof medicalRecordSchema>;

// Payment schema
export const paymentSchema = z.object({
  id: z.number(),
  patient_id: z.number(),
  medical_record_id: z.number().nullable(),
  cashier_id: z.number(), // user_id of the cashier/receptionist
  doctor_service_fee: z.number(),
  medicine_fee: z.number(),
  total_amount: z.number(),
  payment_date: z.coerce.date(),
  receipt_number: z.string(),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date()
});

export type Payment = z.infer<typeof paymentSchema>;

// Input schemas for creating records
export const createUserInputSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(6),
  full_name: z.string().min(1),
  role: userRoleSchema,
  is_active: z.boolean().default(true)
});

export type CreateUserInput = z.infer<typeof createUserInputSchema>;

export const createPatientInputSchema = z.object({
  medical_record_number: z.string().min(1),
  full_name: z.string().min(1),
  phone_number: z.string().min(1),
  address: z.string().min(1),
  date_of_birth: z.coerce.date()
});

export type CreatePatientInput = z.infer<typeof createPatientInputSchema>;

export const createDoctorInputSchema = z.object({
  user_id: z.number(),
  specialization: z.string().min(1),
  practice_schedule: z.string().min(1)
});

export type CreateDoctorInput = z.infer<typeof createDoctorInputSchema>;

export const createMedicalRecordInputSchema = z.object({
  patient_id: z.number(),
  doctor_id: z.number(),
  visit_date: z.coerce.date(),
  diagnosis: z.string().min(1),
  prescription: z.string().min(1),
  notes: z.string().nullable().optional()
});

export type CreateMedicalRecordInput = z.infer<typeof createMedicalRecordInputSchema>;

export const createPaymentInputSchema = z.object({
  patient_id: z.number(),
  medical_record_id: z.number().nullable().optional(),
  cashier_id: z.number(),
  doctor_service_fee: z.number().nonnegative(),
  medicine_fee: z.number().nonnegative(),
  receipt_number: z.string().min(1)
});

export type CreatePaymentInput = z.infer<typeof createPaymentInputSchema>;

// Update schemas
export const updateUserInputSchema = z.object({
  id: z.number(),
  username: z.string().min(1).optional(),
  password: z.string().min(6).optional(),
  full_name: z.string().min(1).optional(),
  role: userRoleSchema.optional(),
  is_active: z.boolean().optional()
});

export type UpdateUserInput = z.infer<typeof updateUserInputSchema>;

export const updatePatientInputSchema = z.object({
  id: z.number(),
  medical_record_number: z.string().min(1).optional(),
  full_name: z.string().min(1).optional(),
  phone_number: z.string().min(1).optional(),
  address: z.string().min(1).optional(),
  date_of_birth: z.coerce.date().optional()
});

export type UpdatePatientInput = z.infer<typeof updatePatientInputSchema>;

export const updateDoctorInputSchema = z.object({
  id: z.number(),
  specialization: z.string().min(1).optional(),
  practice_schedule: z.string().min(1).optional()
});

export type UpdateDoctorInput = z.infer<typeof updateDoctorInputSchema>;

export const updateMedicalRecordInputSchema = z.object({
  id: z.number(),
  diagnosis: z.string().min(1).optional(),
  prescription: z.string().min(1).optional(),
  notes: z.string().nullable().optional()
});

export type UpdateMedicalRecordInput = z.infer<typeof updateMedicalRecordInputSchema>;

// Search schemas
export const searchPatientInputSchema = z.object({
  query: z.string().min(1),
  limit: z.number().int().positive().default(50),
  offset: z.number().int().nonnegative().default(0)
});

export type SearchPatientInput = z.infer<typeof searchPatientInputSchema>;

export const getDoctorPatientsInputSchema = z.object({
  doctor_id: z.number(),
  date: z.coerce.date().optional()
});

export type GetDoctorPatientsInput = z.infer<typeof getDoctorPatientsInputSchema>;

export const getPatientMedicalHistoryInputSchema = z.object({
  patient_id: z.number(),
  limit: z.number().int().positive().default(50),
  offset: z.number().int().nonnegative().default(0)
});

export type GetPatientMedicalHistoryInput = z.infer<typeof getPatientMedicalHistoryInputSchema>;

export const getPaymentHistoryInputSchema = z.object({
  patient_id: z.number().optional(),
  start_date: z.coerce.date().optional(),
  end_date: z.coerce.date().optional(),
  limit: z.number().int().positive().default(50),
  offset: z.number().int().nonnegative().default(0)
});

export type GetPaymentHistoryInput = z.infer<typeof getPaymentHistoryInputSchema>;

// Authentication schemas
export const loginInputSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1)
});

export type LoginInput = z.infer<typeof loginInputSchema>;

export const loginResponseSchema = z.object({
  user: userSchema,
  token: z.string()
});

export type LoginResponse = z.infer<typeof loginResponseSchema>;