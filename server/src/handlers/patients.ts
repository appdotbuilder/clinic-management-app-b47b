import { db } from '../db';
import { patientsTable } from '../db/schema';
import { type Patient, type CreatePatientInput, type UpdatePatientInput, type SearchPatientInput } from '../schema';
import { eq, or, ilike, SQL } from 'drizzle-orm';

/**
 * Creates a new patient record
 * Accessible by admin and receptionist users
 */
export async function createPatient(input: CreatePatientInput): Promise<Patient> {
  try {
    const result = await db.insert(patientsTable)
      .values({
        medical_record_number: input.medical_record_number,
        full_name: input.full_name,
        phone_number: input.phone_number,
        address: input.address,
        date_of_birth: input.date_of_birth
      })
      .returning()
      .execute();

    return result[0];
  } catch (error) {
    console.error('Patient creation failed:', error);
    throw error;
  }
}

/**
 * Retrieves all patients from the database
 * Accessible by admin, doctor, and receptionist users
 */
export async function getPatients(): Promise<Patient[]> {
  try {
    const patients = await db.select()
      .from(patientsTable)
      .execute();

    return patients;
  } catch (error) {
    console.error('Get patients failed:', error);
    throw error;
  }
}

/**
 * Retrieves a specific patient by ID
 * Accessible by admin, doctor, and receptionist users
 */
export async function getPatientById(id: number): Promise<Patient | null> {
  try {
    const patients = await db.select()
      .from(patientsTable)
      .where(eq(patientsTable.id, id))
      .execute();

    return patients.length > 0 ? patients[0] : null;
  } catch (error) {
    console.error('Get patient by ID failed:', error);
    throw error;
  }
}

/**
 * Updates patient information
 * Accessible by admin and receptionist users
 */
export async function updatePatient(input: UpdatePatientInput): Promise<Patient> {
  try {
    // Build update values object with only provided fields
    const updateValues: any = {};
    
    if (input.medical_record_number !== undefined) {
      updateValues.medical_record_number = input.medical_record_number;
    }
    if (input.full_name !== undefined) {
      updateValues.full_name = input.full_name;
    }
    if (input.phone_number !== undefined) {
      updateValues.phone_number = input.phone_number;
    }
    if (input.address !== undefined) {
      updateValues.address = input.address;
    }
    if (input.date_of_birth !== undefined) {
      updateValues.date_of_birth = input.date_of_birth;
    }

    // Always update the updated_at timestamp
    updateValues.updated_at = new Date();

    const result = await db.update(patientsTable)
      .set(updateValues)
      .where(eq(patientsTable.id, input.id))
      .returning()
      .execute();

    if (result.length === 0) {
      throw new Error(`Patient with ID ${input.id} not found`);
    }

    return result[0];
  } catch (error) {
    console.error('Patient update failed:', error);
    throw error;
  }
}

/**
 * Deletes a patient record
 * Accessible by admin users only
 */
export async function deletePatient(id: number): Promise<{ success: boolean }> {
  try {
    const result = await db.delete(patientsTable)
      .where(eq(patientsTable.id, id))
      .returning()
      .execute();

    return { success: result.length > 0 };
  } catch (error) {
    console.error('Patient deletion failed:', error);
    throw error;
  }
}

/**
 * Searches for patients by name, phone, or medical record number
 * Accessible by admin, doctor, and receptionist users
 */
export async function searchPatients(input: SearchPatientInput): Promise<Patient[]> {
  try {
    // Build search conditions
    const searchTerm = `%${input.query}%`;

    const conditions: SQL<unknown>[] = [];
    conditions.push(ilike(patientsTable.full_name, searchTerm));
    conditions.push(ilike(patientsTable.phone_number, searchTerm));
    conditions.push(ilike(patientsTable.medical_record_number, searchTerm));

    // Execute query with all conditions at once
    const patients = await db.select()
      .from(patientsTable)
      .where(or(...conditions))
      .limit(input.limit)
      .offset(input.offset)
      .execute();

    return patients;
  } catch (error) {
    console.error('Patient search failed:', error);
    throw error;
  }
}