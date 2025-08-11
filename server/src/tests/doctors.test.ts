import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { usersTable, doctorsTable, patientsTable, medicalRecordsTable } from '../db/schema';
import { type CreateDoctorInput, type UpdateDoctorInput, type GetDoctorPatientsInput } from '../schema';
import { createDoctor, getDoctors, getDoctorById, updateDoctor, deleteDoctor, getDoctorPatients } from '../handlers/doctors';
import { eq } from 'drizzle-orm';

// Test data
const testUser = {
  username: 'testdoctor',
  password_hash: 'hashedpassword123',
  full_name: 'Dr. Test Doctor',
  role: 'doctor' as const,
  is_active: true
};

const testAdminUser = {
  username: 'testadmin',
  password_hash: 'hashedpassword123',
  full_name: 'Test Admin',
  role: 'admin' as const,
  is_active: true
};

const testReceptionistUser = {
  username: 'testreceptionist',
  password_hash: 'hashedpassword123',
  full_name: 'Test Receptionist',
  role: 'receptionist' as const,
  is_active: true
};

const testPatient = {
  medical_record_number: 'MRN-001',
  full_name: 'Test Patient',
  phone_number: '+1234567890',
  address: '123 Test St',
  date_of_birth: new Date('1990-01-01')
};

describe('createDoctor', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  it('should create a doctor profile for a valid doctor user', async () => {
    // Create a user with doctor role first
    const userResult = await db.insert(usersTable)
      .values(testUser)
      .returning()
      .execute();

    const testInput: CreateDoctorInput = {
      user_id: userResult[0].id,
      specialization: 'Cardiology',
      practice_schedule: '{"monday": "9:00-17:00", "tuesday": "9:00-17:00"}'
    };

    const result = await createDoctor(testInput);

    expect(result.user_id).toEqual(userResult[0].id);
    expect(result.specialization).toEqual('Cardiology');
    expect(result.practice_schedule).toEqual('{"monday": "9:00-17:00", "tuesday": "9:00-17:00"}');
    expect(result.id).toBeDefined();
    expect(result.created_at).toBeInstanceOf(Date);
    expect(result.updated_at).toBeInstanceOf(Date);
  });

  it('should save doctor to database', async () => {
    // Create a user with doctor role first
    const userResult = await db.insert(usersTable)
      .values(testUser)
      .returning()
      .execute();

    const testInput: CreateDoctorInput = {
      user_id: userResult[0].id,
      specialization: 'Cardiology',
      practice_schedule: '{"monday": "9:00-17:00"}'
    };

    const result = await createDoctor(testInput);

    const doctors = await db.select()
      .from(doctorsTable)
      .where(eq(doctorsTable.id, result.id))
      .execute();

    expect(doctors).toHaveLength(1);
    expect(doctors[0].user_id).toEqual(userResult[0].id);
    expect(doctors[0].specialization).toEqual('Cardiology');
  });

  it('should throw error for non-existent user', async () => {
    const testInput: CreateDoctorInput = {
      user_id: 999,
      specialization: 'Cardiology',
      practice_schedule: '{"monday": "9:00-17:00"}'
    };

    expect(createDoctor(testInput)).rejects.toThrow(/user not found/i);
  });

  it('should throw error for user without doctor role', async () => {
    // Create a user with admin role
    const userResult = await db.insert(usersTable)
      .values(testAdminUser)
      .returning()
      .execute();

    const testInput: CreateDoctorInput = {
      user_id: userResult[0].id,
      specialization: 'Cardiology',
      practice_schedule: '{"monday": "9:00-17:00"}'
    };

    expect(createDoctor(testInput)).rejects.toThrow(/must have doctor role/i);
  });

  it('should throw error for duplicate doctor profile', async () => {
    // Create a user with doctor role first
    const userResult = await db.insert(usersTable)
      .values(testUser)
      .returning()
      .execute();

    const testInput: CreateDoctorInput = {
      user_id: userResult[0].id,
      specialization: 'Cardiology',
      practice_schedule: '{"monday": "9:00-17:00"}'
    };

    // Create first doctor profile
    await createDoctor(testInput);

    // Try to create duplicate
    expect(createDoctor(testInput)).rejects.toThrow(/already exists/i);
  });
});

describe('getDoctors', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  it('should return empty array when no doctors exist', async () => {
    const result = await getDoctors();
    expect(result).toEqual([]);
  });

  it('should return all doctors', async () => {
    // Create users with doctor roles
    const user1 = await db.insert(usersTable)
      .values({ ...testUser, username: 'doctor1' })
      .returning()
      .execute();

    const user2 = await db.insert(usersTable)
      .values({ ...testUser, username: 'doctor2' })
      .returning()
      .execute();

    // Create doctor profiles
    await db.insert(doctorsTable)
      .values({
        user_id: user1[0].id,
        specialization: 'Cardiology',
        practice_schedule: '{"monday": "9:00-17:00"}'
      })
      .execute();

    await db.insert(doctorsTable)
      .values({
        user_id: user2[0].id,
        specialization: 'Neurology',
        practice_schedule: '{"tuesday": "10:00-18:00"}'
      })
      .execute();

    const result = await getDoctors();

    expect(result).toHaveLength(2);
    expect(result[0].specialization).toBeDefined();
    expect(result[1].specialization).toBeDefined();
    expect(result[0].user_id).toBeDefined();
    expect(result[1].user_id).toBeDefined();
  });
});

describe('getDoctorById', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  it('should return null for non-existent doctor', async () => {
    const result = await getDoctorById(999);
    expect(result).toBeNull();
  });

  it('should return doctor by ID', async () => {
    // Create user with doctor role
    const userResult = await db.insert(usersTable)
      .values(testUser)
      .returning()
      .execute();

    // Create doctor profile
    const doctorResult = await db.insert(doctorsTable)
      .values({
        user_id: userResult[0].id,
        specialization: 'Cardiology',
        practice_schedule: '{"monday": "9:00-17:00"}'
      })
      .returning()
      .execute();

    const result = await getDoctorById(doctorResult[0].id);

    expect(result).not.toBeNull();
    expect(result!.id).toEqual(doctorResult[0].id);
    expect(result!.specialization).toEqual('Cardiology');
    expect(result!.user_id).toEqual(userResult[0].id);
  });
});

describe('updateDoctor', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  it('should update doctor information', async () => {
    // Create user and doctor
    const userResult = await db.insert(usersTable)
      .values(testUser)
      .returning()
      .execute();

    const doctorResult = await db.insert(doctorsTable)
      .values({
        user_id: userResult[0].id,
        specialization: 'Cardiology',
        practice_schedule: '{"monday": "9:00-17:00"}'
      })
      .returning()
      .execute();

    const testInput: UpdateDoctorInput = {
      id: doctorResult[0].id,
      specialization: 'Neurology',
      practice_schedule: '{"tuesday": "10:00-18:00"}'
    };

    const result = await updateDoctor(testInput);

    expect(result.id).toEqual(doctorResult[0].id);
    expect(result.specialization).toEqual('Neurology');
    expect(result.practice_schedule).toEqual('{"tuesday": "10:00-18:00"}');
    expect(result.updated_at).toBeInstanceOf(Date);
  });

  it('should update only provided fields', async () => {
    // Create user and doctor
    const userResult = await db.insert(usersTable)
      .values(testUser)
      .returning()
      .execute();

    const doctorResult = await db.insert(doctorsTable)
      .values({
        user_id: userResult[0].id,
        specialization: 'Cardiology',
        practice_schedule: '{"monday": "9:00-17:00"}'
      })
      .returning()
      .execute();

    const testInput: UpdateDoctorInput = {
      id: doctorResult[0].id,
      specialization: 'Neurology'
      // practice_schedule not provided
    };

    const result = await updateDoctor(testInput);

    expect(result.specialization).toEqual('Neurology');
    expect(result.practice_schedule).toEqual('{"monday": "9:00-17:00"}'); // Should remain unchanged
  });

  it('should throw error for non-existent doctor', async () => {
    const testInput: UpdateDoctorInput = {
      id: 999,
      specialization: 'Neurology'
    };

    expect(updateDoctor(testInput)).rejects.toThrow(/not found/i);
  });
});

describe('deleteDoctor', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  it('should delete doctor without medical records', async () => {
    // Create user and doctor
    const userResult = await db.insert(usersTable)
      .values(testUser)
      .returning()
      .execute();

    const doctorResult = await db.insert(doctorsTable)
      .values({
        user_id: userResult[0].id,
        specialization: 'Cardiology',
        practice_schedule: '{"monday": "9:00-17:00"}'
      })
      .returning()
      .execute();

    const result = await deleteDoctor(doctorResult[0].id);

    expect(result.success).toBe(true);

    // Verify doctor is deleted
    const doctors = await db.select()
      .from(doctorsTable)
      .where(eq(doctorsTable.id, doctorResult[0].id))
      .execute();

    expect(doctors).toHaveLength(0);
  });

  it('should throw error when doctor has medical records', async () => {
    // Create user, doctor, patient, and medical record
    const userResult = await db.insert(usersTable)
      .values(testUser)
      .returning()
      .execute();

    const doctorResult = await db.insert(doctorsTable)
      .values({
        user_id: userResult[0].id,
        specialization: 'Cardiology',
        practice_schedule: '{"monday": "9:00-17:00"}'
      })
      .returning()
      .execute();

    const patientResult = await db.insert(patientsTable)
      .values(testPatient)
      .returning()
      .execute();

    await db.insert(medicalRecordsTable)
      .values({
        patient_id: patientResult[0].id,
        doctor_id: doctorResult[0].id,
        visit_date: new Date(),
        diagnosis: 'Test diagnosis',
        prescription: 'Test prescription'
      })
      .execute();

    expect(deleteDoctor(doctorResult[0].id)).rejects.toThrow(/existing medical records/i);
  });
});

describe('getDoctorPatients', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  it('should return empty array when doctor has no patients', async () => {
    const testInput: GetDoctorPatientsInput = {
      doctor_id: 999
    };

    const result = await getDoctorPatients(testInput);
    expect(result).toEqual([]);
  });

  it('should return patients seen by doctor on specified date', async () => {
    // Create user, doctor, and patient
    const userResult = await db.insert(usersTable)
      .values(testUser)
      .returning()
      .execute();

    const doctorResult = await db.insert(doctorsTable)
      .values({
        user_id: userResult[0].id,
        specialization: 'Cardiology',
        practice_schedule: '{"monday": "9:00-17:00"}'
      })
      .returning()
      .execute();

    const patientResult = await db.insert(patientsTable)
      .values(testPatient)
      .returning()
      .execute();

    const visitDate = new Date('2024-01-15T10:00:00');

    await db.insert(medicalRecordsTable)
      .values({
        patient_id: patientResult[0].id,
        doctor_id: doctorResult[0].id,
        visit_date: visitDate,
        diagnosis: 'Hypertension',
        prescription: 'Lisinopril 10mg'
      })
      .execute();

    const testInput: GetDoctorPatientsInput = {
      doctor_id: doctorResult[0].id,
      date: new Date('2024-01-15')
    };

    const result = await getDoctorPatients(testInput);

    expect(result).toHaveLength(1);
    expect(result[0].patient.full_name).toEqual('Test Patient');
    expect(result[0].medical_record.diagnosis).toEqual('Hypertension');
    expect(result[0].medical_record.visit_date).toBeInstanceOf(Date);
  });

  it('should filter patients by current date when no date provided', async () => {
    // Create user, doctor, and patient
    const userResult = await db.insert(usersTable)
      .values(testUser)
      .returning()
      .execute();

    const doctorResult = await db.insert(doctorsTable)
      .values({
        user_id: userResult[0].id,
        specialization: 'Cardiology',
        practice_schedule: '{"monday": "9:00-17:00"}'
      })
      .returning()
      .execute();

    const patientResult = await db.insert(patientsTable)
      .values(testPatient)
      .returning()
      .execute();

    // Create medical record for today
    const today = new Date();
    await db.insert(medicalRecordsTable)
      .values({
        patient_id: patientResult[0].id,
        doctor_id: doctorResult[0].id,
        visit_date: today,
        diagnosis: 'Hypertension',
        prescription: 'Lisinopril 10mg'
      })
      .execute();

    // Create medical record for yesterday (should not be included)
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    await db.insert(medicalRecordsTable)
      .values({
        patient_id: patientResult[0].id,
        doctor_id: doctorResult[0].id,
        visit_date: yesterday,
        diagnosis: 'Diabetes',
        prescription: 'Metformin 500mg'
      })
      .execute();

    const testInput: GetDoctorPatientsInput = {
      doctor_id: doctorResult[0].id
      // No date provided - should default to today
    };

    const result = await getDoctorPatients(testInput);

    expect(result).toHaveLength(1);
    expect(result[0].medical_record.diagnosis).toEqual('Hypertension');
  });
});