import { db } from '../db';
import { medicalRecordsTable, patientsTable, doctorsTable, usersTable, paymentsTable } from '../db/schema';
import { type MedicalRecord, type CreateMedicalRecordInput, type UpdateMedicalRecordInput, type GetPatientMedicalHistoryInput } from '../schema';
import { eq, desc, gte, lt, and, sql, SQL } from 'drizzle-orm';

/**
 * Creates a new medical record for a patient visit
 * Accessible by doctor and admin users
 */
export async function createMedicalRecord(input: CreateMedicalRecordInput): Promise<MedicalRecord> {
  try {
    // Verify patient exists
    const patient = await db.select()
      .from(patientsTable)
      .where(eq(patientsTable.id, input.patient_id))
      .limit(1)
      .execute();

    if (patient.length === 0) {
      throw new Error(`Patient with ID ${input.patient_id} not found`);
    }

    // Verify doctor exists
    const doctor = await db.select()
      .from(doctorsTable)
      .where(eq(doctorsTable.id, input.doctor_id))
      .limit(1)
      .execute();

    if (doctor.length === 0) {
      throw new Error(`Doctor with ID ${input.doctor_id} not found`);
    }

    // Insert medical record
    const result = await db.insert(medicalRecordsTable)
      .values({
        patient_id: input.patient_id,
        doctor_id: input.doctor_id,
        visit_date: input.visit_date,
        diagnosis: input.diagnosis,
        prescription: input.prescription,
        notes: input.notes || null
      })
      .returning()
      .execute();

    return result[0];
  } catch (error) {
    console.error('Medical record creation failed:', error);
    throw error;
  }
}

/**
 * Retrieves all medical records with patient and doctor information
 * Accessible by admin users
 */
export async function getMedicalRecords(): Promise<MedicalRecord[]> {
  try {
    const results = await db.select()
      .from(medicalRecordsTable)
      .orderBy(desc(medicalRecordsTable.visit_date))
      .execute();

    return results;
  } catch (error) {
    console.error('Failed to fetch medical records:', error);
    throw error;
  }
}

/**
 * Retrieves a specific medical record by ID
 * Accessible by admin, doctor who created it, and related patient
 */
export async function getMedicalRecordById(id: number): Promise<MedicalRecord | null> {
  try {
    const results = await db.select()
      .from(medicalRecordsTable)
      .where(eq(medicalRecordsTable.id, id))
      .limit(1)
      .execute();

    return results.length > 0 ? results[0] : null;
  } catch (error) {
    console.error('Failed to fetch medical record:', error);
    throw error;
  }
}

/**
 * Updates medical record information
 * Only accessible by the doctor who created it and admin users
 */
export async function updateMedicalRecord(input: UpdateMedicalRecordInput): Promise<MedicalRecord> {
  try {
    // Check if medical record exists
    const existingRecord = await getMedicalRecordById(input.id);
    if (!existingRecord) {
      throw new Error(`Medical record with ID ${input.id} not found`);
    }

    // Build update values dynamically
    const updateValues: Partial<typeof medicalRecordsTable.$inferInsert> = {};
    
    if (input.diagnosis !== undefined) {
      updateValues.diagnosis = input.diagnosis;
    }
    if (input.prescription !== undefined) {
      updateValues.prescription = input.prescription;
    }
    if (input.notes !== undefined) {
      updateValues.notes = input.notes;
    }

    // Only update if there are actual changes
    if (Object.keys(updateValues).length === 0) {
      return existingRecord;
    }

    const result = await db.update(medicalRecordsTable)
      .set(updateValues)
      .where(eq(medicalRecordsTable.id, input.id))
      .returning()
      .execute();

    return result[0];
  } catch (error) {
    console.error('Medical record update failed:', error);
    throw error;
  }
}

/**
 * Deletes a medical record
 * Only accessible by admin users
 */
export async function deleteMedicalRecord(id: number): Promise<{ success: boolean }> {
  try {
    // Check if medical record exists
    const existingRecord = await getMedicalRecordById(id);
    if (!existingRecord) {
      throw new Error(`Medical record with ID ${id} not found`);
    }

    // Check if there are related payments
    const relatedPayments = await db.select()
      .from(paymentsTable)
      .where(eq(paymentsTable.medical_record_id, id))
      .limit(1)
      .execute();

    if (relatedPayments.length > 0) {
      throw new Error(`Cannot delete medical record with ID ${id} because it has related payments`);
    }

    // Delete the medical record
    await db.delete(medicalRecordsTable)
      .where(eq(medicalRecordsTable.id, id))
      .execute();

    return { success: true };
  } catch (error) {
    console.error('Medical record deletion failed:', error);
    throw error;
  }
}

/**
 * Gets medical history for a specific patient
 * Accessible by admin, doctors, and the patient's treating doctors
 */
export async function getPatientMedicalHistory(input: GetPatientMedicalHistoryInput): Promise<MedicalRecord[]> {
  try {
    // Verify patient exists
    const patient = await db.select()
      .from(patientsTable)
      .where(eq(patientsTable.id, input.patient_id))
      .limit(1)
      .execute();

    if (patient.length === 0) {
      throw new Error(`Patient with ID ${input.patient_id} not found`);
    }

    const results = await db.select()
      .from(medicalRecordsTable)
      .where(eq(medicalRecordsTable.patient_id, input.patient_id))
      .orderBy(desc(medicalRecordsTable.visit_date))
      .limit(input.limit)
      .offset(input.offset)
      .execute();

    return results;
  } catch (error) {
    console.error('Failed to fetch patient medical history:', error);
    throw error;
  }
}

/**
 * Gets today's medical records for a specific doctor
 * Accessible by the doctor themselves and admin users
 */
export async function getTodaysMedicalRecords(doctorId: number): Promise<MedicalRecord[]> {
  try {
    // Verify doctor exists
    const doctor = await db.select()
      .from(doctorsTable)
      .where(eq(doctorsTable.id, doctorId))
      .limit(1)
      .execute();

    if (doctor.length === 0) {
      throw new Error(`Doctor with ID ${doctorId} not found`);
    }

    // Get today's date range (start and end of today)
    const today = new Date();
    const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);

    const results = await db.select()
      .from(medicalRecordsTable)
      .where(
        and(
          eq(medicalRecordsTable.doctor_id, doctorId),
          gte(medicalRecordsTable.visit_date, startOfDay),
          lt(medicalRecordsTable.visit_date, endOfDay)
        )
      )
      .orderBy(desc(medicalRecordsTable.visit_date))
      .execute();

    return results;
  } catch (error) {
    console.error('Failed to fetch today\'s medical records:', error);
    throw error;
  }
}