import { db } from '../db';
import { doctorsTable, usersTable, medicalRecordsTable, patientsTable } from '../db/schema';
import { type Doctor, type CreateDoctorInput, type UpdateDoctorInput, type GetDoctorPatientsInput } from '../schema';
import { eq, and, gte, lt, SQL } from 'drizzle-orm';

/**
 * Creates a new doctor profile linked to a user account
 * Only accessible by admin users
 */
export async function createDoctor(input: CreateDoctorInput): Promise<Doctor> {
  try {
    // Validate that the user exists and has doctor role
    const user = await db.select()
      .from(usersTable)
      .where(eq(usersTable.id, input.user_id))
      .execute();

    if (user.length === 0) {
      throw new Error('User not found');
    }

    if (user[0].role !== 'doctor') {
      throw new Error('User must have doctor role');
    }

    // Check if doctor profile already exists for this user
    const existingDoctor = await db.select()
      .from(doctorsTable)
      .where(eq(doctorsTable.user_id, input.user_id))
      .execute();

    if (existingDoctor.length > 0) {
      throw new Error('Doctor profile already exists for this user');
    }

    // Insert doctor record
    const result = await db.insert(doctorsTable)
      .values({
        user_id: input.user_id,
        specialization: input.specialization,
        practice_schedule: input.practice_schedule
      })
      .returning()
      .execute();

    return result[0];
  } catch (error) {
    console.error('Doctor creation failed:', error);
    throw error;
  }
}

/**
 * Retrieves all doctors with their user information
 * Accessible by admin and receptionist users
 */
export async function getDoctors(): Promise<Doctor[]> {
  try {
    const results = await db.select()
      .from(doctorsTable)
      .innerJoin(usersTable, eq(doctorsTable.user_id, usersTable.id))
      .execute();

    return results.map(result => result.doctors);
  } catch (error) {
    console.error('Failed to get doctors:', error);
    throw error;
  }
}

/**
 * Retrieves a specific doctor by ID with user information
 * Accessible by admin, doctor, and receptionist users
 */
export async function getDoctorById(id: number): Promise<Doctor | null> {
  try {
    const results = await db.select()
      .from(doctorsTable)
      .innerJoin(usersTable, eq(doctorsTable.user_id, usersTable.id))
      .where(eq(doctorsTable.id, id))
      .execute();

    return results.length > 0 ? results[0].doctors : null;
  } catch (error) {
    console.error('Failed to get doctor by ID:', error);
    throw error;
  }
}

/**
 * Updates doctor information
 * Accessible by admin users and the doctor themselves
 */
export async function updateDoctor(input: UpdateDoctorInput): Promise<Doctor> {
  try {
    // Check if doctor exists
    const existingDoctor = await db.select()
      .from(doctorsTable)
      .where(eq(doctorsTable.id, input.id))
      .execute();

    if (existingDoctor.length === 0) {
      throw new Error('Doctor not found');
    }

    // Build update object with only provided fields
    const updateData: any = {};
    if (input.specialization !== undefined) {
      updateData.specialization = input.specialization;
    }
    if (input.practice_schedule !== undefined) {
      updateData.practice_schedule = input.practice_schedule;
    }

    // Add updated_at timestamp
    updateData.updated_at = new Date();

    const result = await db.update(doctorsTable)
      .set(updateData)
      .where(eq(doctorsTable.id, input.id))
      .returning()
      .execute();

    return result[0];
  } catch (error) {
    console.error('Doctor update failed:', error);
    throw error;
  }
}

/**
 * Deletes a doctor profile
 * Only accessible by admin users
 */
export async function deleteDoctor(id: number): Promise<{ success: boolean }> {
  try {
    // Check if doctor has medical records
    const medicalRecords = await db.select()
      .from(medicalRecordsTable)
      .where(eq(medicalRecordsTable.doctor_id, id))
      .execute();

    if (medicalRecords.length > 0) {
      throw new Error('Cannot delete doctor with existing medical records');
    }

    const result = await db.delete(doctorsTable)
      .where(eq(doctorsTable.id, id))
      .execute();

    return { success: true };
  } catch (error) {
    console.error('Doctor deletion failed:', error);
    throw error;
  }
}

/**
 * Gets list of patients seen by a specific doctor on a given date
 * Accessible by the doctor themselves and admin users
 */
export async function getDoctorPatients(input: GetDoctorPatientsInput): Promise<any[]> {
  try {
    // Build query conditions
    const conditions: SQL<unknown>[] = [
      eq(medicalRecordsTable.doctor_id, input.doctor_id)
    ];

    // If date is provided, filter by that date; otherwise use today
    const targetDate = input.date || new Date();
    const startOfDay = new Date(targetDate);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(targetDate);
    endOfDay.setHours(23, 59, 59, 999);

    conditions.push(gte(medicalRecordsTable.visit_date, startOfDay));
    conditions.push(lt(medicalRecordsTable.visit_date, endOfDay));

    const results = await db.select()
      .from(medicalRecordsTable)
      .innerJoin(patientsTable, eq(medicalRecordsTable.patient_id, patientsTable.id))
      .where(and(...conditions))
      .execute();

    return results.map(result => ({
      patient: result.patients,
      medical_record: result.medical_records
    }));
  } catch (error) {
    console.error('Failed to get doctor patients:', error);
    throw error;
  }
}