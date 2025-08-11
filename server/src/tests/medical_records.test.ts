import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { usersTable, patientsTable, doctorsTable, medicalRecordsTable, paymentsTable } from '../db/schema';
import { 
  type CreateMedicalRecordInput, 
  type UpdateMedicalRecordInput, 
  type GetPatientMedicalHistoryInput 
} from '../schema';
import { 
  createMedicalRecord, 
  getMedicalRecords, 
  getMedicalRecordById, 
  updateMedicalRecord, 
  deleteMedicalRecord, 
  getPatientMedicalHistory, 
  getTodaysMedicalRecords 
} from '../handlers/medical_records';
import { eq } from 'drizzle-orm';

// Test data
const testUser = {
  username: 'test_doctor',
  password_hash: 'hashed_password',
  full_name: 'Dr. Test Doctor',
  role: 'doctor' as const,
  is_active: true
};

const testPatient = {
  medical_record_number: 'MRN001',
  full_name: 'John Doe',
  phone_number: '123-456-7890',
  address: '123 Main St',
  date_of_birth: new Date('1985-06-15')
};

const testCashier = {
  username: 'test_cashier',
  password_hash: 'hashed_password',
  full_name: 'Test Cashier',
  role: 'receptionist' as const,
  is_active: true
};

describe('Medical Records Handlers', () => {
  let userId: number;
  let patientId: number;
  let doctorId: number;
  let cashierId: number;

  beforeEach(async () => {
    await createDB();

    // Create test user
    const userResult = await db.insert(usersTable)
      .values(testUser)
      .returning()
      .execute();
    userId = userResult[0].id;

    // Create test cashier
    const cashierResult = await db.insert(usersTable)
      .values(testCashier)
      .returning()
      .execute();
    cashierId = cashierResult[0].id;

    // Create test patient
    const patientResult = await db.insert(patientsTable)
      .values(testPatient)
      .returning()
      .execute();
    patientId = patientResult[0].id;

    // Create test doctor
    const doctorResult = await db.insert(doctorsTable)
      .values({
        user_id: userId,
        specialization: 'General Medicine',
        practice_schedule: '{"monday": "9-17", "tuesday": "9-17"}'
      })
      .returning()
      .execute();
    doctorId = doctorResult[0].id;
  });

  afterEach(resetDB);

  describe('createMedicalRecord', () => {
    it('should create a medical record successfully', async () => {
      const input: CreateMedicalRecordInput = {
        patient_id: patientId,
        doctor_id: doctorId,
        visit_date: new Date('2024-01-15'),
        diagnosis: 'Common cold',
        prescription: 'Rest and fluids',
        notes: 'Patient recovering well'
      };

      const result = await createMedicalRecord(input);

      expect(result.id).toBeDefined();
      expect(result.patient_id).toEqual(patientId);
      expect(result.doctor_id).toEqual(doctorId);
      expect(result.diagnosis).toEqual('Common cold');
      expect(result.prescription).toEqual('Rest and fluids');
      expect(result.notes).toEqual('Patient recovering well');
      expect(result.created_at).toBeInstanceOf(Date);
      expect(result.updated_at).toBeInstanceOf(Date);
    });

    it('should create a medical record with null notes', async () => {
      const input: CreateMedicalRecordInput = {
        patient_id: patientId,
        doctor_id: doctorId,
        visit_date: new Date('2024-01-15'),
        diagnosis: 'Routine checkup',
        prescription: 'No medication needed'
      };

      const result = await createMedicalRecord(input);

      expect(result.notes).toBeNull();
    });

    it('should save medical record to database', async () => {
      const input: CreateMedicalRecordInput = {
        patient_id: patientId,
        doctor_id: doctorId,
        visit_date: new Date('2024-01-15'),
        diagnosis: 'Hypertension',
        prescription: 'Amlodipine 5mg daily',
        notes: 'Monitor blood pressure'
      };

      const result = await createMedicalRecord(input);

      const records = await db.select()
        .from(medicalRecordsTable)
        .where(eq(medicalRecordsTable.id, result.id))
        .execute();

      expect(records).toHaveLength(1);
      expect(records[0].diagnosis).toEqual('Hypertension');
      expect(records[0].prescription).toEqual('Amlodipine 5mg daily');
    });

    it('should throw error when patient does not exist', async () => {
      const input: CreateMedicalRecordInput = {
        patient_id: 99999,
        doctor_id: doctorId,
        visit_date: new Date('2024-01-15'),
        diagnosis: 'Test diagnosis',
        prescription: 'Test prescription'
      };

      await expect(createMedicalRecord(input)).rejects.toThrow(/Patient with ID 99999 not found/);
    });

    it('should throw error when doctor does not exist', async () => {
      const input: CreateMedicalRecordInput = {
        patient_id: patientId,
        doctor_id: 99999,
        visit_date: new Date('2024-01-15'),
        diagnosis: 'Test diagnosis',
        prescription: 'Test prescription'
      };

      await expect(createMedicalRecord(input)).rejects.toThrow(/Doctor with ID 99999 not found/);
    });
  });

  describe('getMedicalRecords', () => {
    it('should return empty array when no records exist', async () => {
      const result = await getMedicalRecords();
      expect(result).toHaveLength(0);
    });

    it('should return all medical records ordered by visit date (newest first)', async () => {
      // Create multiple medical records
      const record1Input: CreateMedicalRecordInput = {
        patient_id: patientId,
        doctor_id: doctorId,
        visit_date: new Date('2024-01-10'),
        diagnosis: 'First visit',
        prescription: 'First prescription'
      };

      const record2Input: CreateMedicalRecordInput = {
        patient_id: patientId,
        doctor_id: doctorId,
        visit_date: new Date('2024-01-20'),
        diagnosis: 'Second visit',
        prescription: 'Second prescription'
      };

      await createMedicalRecord(record1Input);
      await createMedicalRecord(record2Input);

      const results = await getMedicalRecords();

      expect(results).toHaveLength(2);
      expect(results[0].diagnosis).toEqual('Second visit'); // Newer record first
      expect(results[1].diagnosis).toEqual('First visit'); // Older record second
    });
  });

  describe('getMedicalRecordById', () => {
    it('should return null when record does not exist', async () => {
      const result = await getMedicalRecordById(99999);
      expect(result).toBeNull();
    });

    it('should return medical record when it exists', async () => {
      const input: CreateMedicalRecordInput = {
        patient_id: patientId,
        doctor_id: doctorId,
        visit_date: new Date('2024-01-15'),
        diagnosis: 'Test diagnosis',
        prescription: 'Test prescription'
      };

      const created = await createMedicalRecord(input);
      const result = await getMedicalRecordById(created.id);

      expect(result).not.toBeNull();
      expect(result!.id).toEqual(created.id);
      expect(result!.diagnosis).toEqual('Test diagnosis');
    });
  });

  describe('updateMedicalRecord', () => {
    it('should update medical record successfully', async () => {
      const createInput: CreateMedicalRecordInput = {
        patient_id: patientId,
        doctor_id: doctorId,
        visit_date: new Date('2024-01-15'),
        diagnosis: 'Original diagnosis',
        prescription: 'Original prescription',
        notes: 'Original notes'
      };

      const created = await createMedicalRecord(createInput);

      const updateInput: UpdateMedicalRecordInput = {
        id: created.id,
        diagnosis: 'Updated diagnosis',
        prescription: 'Updated prescription',
        notes: 'Updated notes'
      };

      const result = await updateMedicalRecord(updateInput);

      expect(result.diagnosis).toEqual('Updated diagnosis');
      expect(result.prescription).toEqual('Updated prescription');
      expect(result.notes).toEqual('Updated notes');
    });

    it('should update only provided fields', async () => {
      const createInput: CreateMedicalRecordInput = {
        patient_id: patientId,
        doctor_id: doctorId,
        visit_date: new Date('2024-01-15'),
        diagnosis: 'Original diagnosis',
        prescription: 'Original prescription',
        notes: 'Original notes'
      };

      const created = await createMedicalRecord(createInput);

      const updateInput: UpdateMedicalRecordInput = {
        id: created.id,
        diagnosis: 'Updated diagnosis only'
      };

      const result = await updateMedicalRecord(updateInput);

      expect(result.diagnosis).toEqual('Updated diagnosis only');
      expect(result.prescription).toEqual('Original prescription'); // Unchanged
      expect(result.notes).toEqual('Original notes'); // Unchanged
    });

    it('should return unchanged record when no fields provided', async () => {
      const createInput: CreateMedicalRecordInput = {
        patient_id: patientId,
        doctor_id: doctorId,
        visit_date: new Date('2024-01-15'),
        diagnosis: 'Original diagnosis',
        prescription: 'Original prescription'
      };

      const created = await createMedicalRecord(createInput);

      const updateInput: UpdateMedicalRecordInput = {
        id: created.id
      };

      const result = await updateMedicalRecord(updateInput);

      expect(result.diagnosis).toEqual('Original diagnosis');
      expect(result.prescription).toEqual('Original prescription');
    });

    it('should throw error when record does not exist', async () => {
      const updateInput: UpdateMedicalRecordInput = {
        id: 99999,
        diagnosis: 'Updated diagnosis'
      };

      await expect(updateMedicalRecord(updateInput)).rejects.toThrow(/Medical record with ID 99999 not found/);
    });
  });

  describe('deleteMedicalRecord', () => {
    it('should delete medical record successfully', async () => {
      const createInput: CreateMedicalRecordInput = {
        patient_id: patientId,
        doctor_id: doctorId,
        visit_date: new Date('2024-01-15'),
        diagnosis: 'Test diagnosis',
        prescription: 'Test prescription'
      };

      const created = await createMedicalRecord(createInput);
      const result = await deleteMedicalRecord(created.id);

      expect(result.success).toBe(true);

      // Verify record is deleted
      const deleted = await getMedicalRecordById(created.id);
      expect(deleted).toBeNull();
    });

    it('should throw error when record does not exist', async () => {
      await expect(deleteMedicalRecord(99999)).rejects.toThrow(/Medical record with ID 99999 not found/);
    });

    it('should prevent deletion when record has related payments', async () => {
      const createInput: CreateMedicalRecordInput = {
        patient_id: patientId,
        doctor_id: doctorId,
        visit_date: new Date('2024-01-15'),
        diagnosis: 'Test diagnosis',
        prescription: 'Test prescription'
      };

      const created = await createMedicalRecord(createInput);

      // Create a payment linked to this medical record
      await db.insert(paymentsTable)
        .values({
          patient_id: patientId,
          medical_record_id: created.id,
          cashier_id: cashierId,
          doctor_service_fee: '50.00',
          medicine_fee: '25.00',
          total_amount: '75.00',
          receipt_number: 'RCP001'
        })
        .execute();

      await expect(deleteMedicalRecord(created.id))
        .rejects.toThrow(/Cannot delete medical record with ID .* because it has related payments/);
    });
  });

  describe('getPatientMedicalHistory', () => {
    it('should return empty array when patient has no records', async () => {
      const input: GetPatientMedicalHistoryInput = {
        patient_id: patientId,
        limit: 50,
        offset: 0
      };

      const result = await getPatientMedicalHistory(input);
      expect(result).toHaveLength(0);
    });

    it('should return patient medical history ordered by visit date (newest first)', async () => {
      // Create multiple records for the patient
      const record1Input: CreateMedicalRecordInput = {
        patient_id: patientId,
        doctor_id: doctorId,
        visit_date: new Date('2024-01-10'),
        diagnosis: 'First visit',
        prescription: 'First prescription'
      };

      const record2Input: CreateMedicalRecordInput = {
        patient_id: patientId,
        doctor_id: doctorId,
        visit_date: new Date('2024-01-20'),
        diagnosis: 'Follow-up visit',
        prescription: 'Adjusted prescription'
      };

      await createMedicalRecord(record1Input);
      await createMedicalRecord(record2Input);

      const input: GetPatientMedicalHistoryInput = {
        patient_id: patientId,
        limit: 50,
        offset: 0
      };

      const results = await getPatientMedicalHistory(input);

      expect(results).toHaveLength(2);
      expect(results[0].diagnosis).toEqual('Follow-up visit'); // Newer first
      expect(results[1].diagnosis).toEqual('First visit'); // Older second
    });

    it('should respect limit and offset parameters', async () => {
      // Create 3 records
      for (let i = 1; i <= 3; i++) {
        await createMedicalRecord({
          patient_id: patientId,
          doctor_id: doctorId,
          visit_date: new Date(`2024-01-${10 + i}`),
          diagnosis: `Visit ${i}`,
          prescription: `Prescription ${i}`
        });
      }

      const input: GetPatientMedicalHistoryInput = {
        patient_id: patientId,
        limit: 2,
        offset: 1
      };

      const results = await getPatientMedicalHistory(input);

      expect(results).toHaveLength(2);
      expect(results[0].diagnosis).toEqual('Visit 2'); // Second newest
      expect(results[1].diagnosis).toEqual('Visit 1'); // Oldest
    });

    it('should throw error when patient does not exist', async () => {
      const input: GetPatientMedicalHistoryInput = {
        patient_id: 99999,
        limit: 50,
        offset: 0
      };

      await expect(getPatientMedicalHistory(input)).rejects.toThrow(/Patient with ID 99999 not found/);
    });
  });

  describe('getTodaysMedicalRecords', () => {
    it('should return empty array when doctor has no records today', async () => {
      const result = await getTodaysMedicalRecords(doctorId);
      expect(result).toHaveLength(0);
    });

    it('should return today\'s medical records for doctor', async () => {
      const today = new Date();
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);

      // Create one record for today
      await createMedicalRecord({
        patient_id: patientId,
        doctor_id: doctorId,
        visit_date: today,
        diagnosis: 'Today\'s visit',
        prescription: 'Today\'s prescription'
      });

      // Create one record for yesterday (should not be included)
      await createMedicalRecord({
        patient_id: patientId,
        doctor_id: doctorId,
        visit_date: yesterday,
        diagnosis: 'Yesterday\'s visit',
        prescription: 'Yesterday\'s prescription'
      });

      const results = await getTodaysMedicalRecords(doctorId);

      expect(results).toHaveLength(1);
      expect(results[0].diagnosis).toEqual('Today\'s visit');
    });

    it('should throw error when doctor does not exist', async () => {
      await expect(getTodaysMedicalRecords(99999)).rejects.toThrow(/Doctor with ID 99999 not found/);
    });

    it('should return multiple today\'s records ordered by visit date (newest first)', async () => {
      const now = new Date();
      const earlier = new Date(now.getTime() - 2 * 60 * 60 * 1000); // 2 hours earlier

      // Create record from earlier today
      await createMedicalRecord({
        patient_id: patientId,
        doctor_id: doctorId,
        visit_date: earlier,
        diagnosis: 'Earlier visit',
        prescription: 'Earlier prescription'
      });

      // Create record from now
      await createMedicalRecord({
        patient_id: patientId,
        doctor_id: doctorId,
        visit_date: now,
        diagnosis: 'Later visit',
        prescription: 'Later prescription'
      });

      const results = await getTodaysMedicalRecords(doctorId);

      expect(results).toHaveLength(2);
      expect(results[0].diagnosis).toEqual('Later visit'); // More recent first
      expect(results[1].diagnosis).toEqual('Earlier visit'); // Earlier second
    });
  });
});