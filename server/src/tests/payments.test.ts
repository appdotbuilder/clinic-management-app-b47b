import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { usersTable, patientsTable, medicalRecordsTable, doctorsTable, paymentsTable } from '../db/schema';
import { type CreatePaymentInput, type GetPaymentHistoryInput } from '../schema';
import {
  createPayment,
  getPayments,
  getPaymentById,
  getPaymentHistory,
  getPaymentReceipt,
  getPaymentStatistics
} from '../handlers/payments';
import { eq } from 'drizzle-orm';

// Test data
const testUser = {
  username: 'cashier01',
  password_hash: 'hashedpassword123',
  full_name: 'John Cashier',
  role: 'receptionist' as const,
  is_active: true
};

const testDoctor = {
  username: 'doctor01',
  password_hash: 'hashedpassword456',
  full_name: 'Dr. Jane Smith',
  role: 'doctor' as const,
  is_active: true
};

const testPatient = {
  medical_record_number: 'MRN001',
  full_name: 'Alice Johnson',
  phone_number: '+1234567890',
  address: '123 Main St',
  date_of_birth: new Date('1990-01-01')
};

const testPaymentInput: CreatePaymentInput = {
  patient_id: 0, // Will be set after patient creation
  medical_record_id: null,
  cashier_id: 0, // Will be set after user creation
  doctor_service_fee: 150.00,
  medicine_fee: 75.50,
  receipt_number: 'RCP001'
};

describe('Payment Handlers', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  let userId: number;
  let doctorUserId: number;
  let doctorId: number;
  let patientId: number;
  let medicalRecordId: number;

  beforeEach(async () => {
    // Create test user (cashier)
    const userResult = await db.insert(usersTable)
      .values(testUser)
      .returning()
      .execute();
    userId = userResult[0].id;

    // Create test doctor user
    const doctorUserResult = await db.insert(usersTable)
      .values(testDoctor)
      .returning()
      .execute();
    doctorUserId = doctorUserResult[0].id;

    // Create doctor profile
    const doctorResult = await db.insert(doctorsTable)
      .values({
        user_id: doctorUserId,
        specialization: 'Internal Medicine',
        practice_schedule: '{"monday": "9-17", "tuesday": "9-17"}'
      })
      .returning()
      .execute();
    doctorId = doctorResult[0].id;

    // Create test patient
    const patientResult = await db.insert(patientsTable)
      .values(testPatient)
      .returning()
      .execute();
    patientId = patientResult[0].id;

    // Create test medical record
    const medicalRecordResult = await db.insert(medicalRecordsTable)
      .values({
        patient_id: patientId,
        doctor_id: doctorId,
        visit_date: new Date(),
        diagnosis: 'Common cold',
        prescription: 'Rest and fluids',
        notes: 'Follow up in 1 week'
      })
      .returning()
      .execute();
    medicalRecordId = medicalRecordResult[0].id;

    // Update test input with actual IDs
    testPaymentInput.patient_id = patientId;
    testPaymentInput.cashier_id = userId;
    testPaymentInput.medical_record_id = medicalRecordId;
  });

  describe('createPayment', () => {
    it('should create a payment successfully', async () => {
      const result = await createPayment(testPaymentInput);

      expect(result.patient_id).toEqual(patientId);
      expect(result.cashier_id).toEqual(userId);
      expect(result.medical_record_id).toEqual(medicalRecordId);
      expect(result.doctor_service_fee).toEqual(150.00);
      expect(result.medicine_fee).toEqual(75.50);
      expect(result.total_amount).toEqual(225.50);
      expect(result.receipt_number).toEqual('RCP001');
      expect(result.id).toBeDefined();
      expect(result.payment_date).toBeInstanceOf(Date);
      expect(result.created_at).toBeInstanceOf(Date);
      expect(result.updated_at).toBeInstanceOf(Date);
    });

    it('should save payment to database correctly', async () => {
      const result = await createPayment(testPaymentInput);

      const payments = await db.select()
        .from(paymentsTable)
        .where(eq(paymentsTable.id, result.id))
        .execute();

      expect(payments).toHaveLength(1);
      expect(parseFloat(payments[0].total_amount)).toEqual(225.50);
      expect(parseFloat(payments[0].doctor_service_fee)).toEqual(150.00);
      expect(parseFloat(payments[0].medicine_fee)).toEqual(75.50);
      expect(payments[0].receipt_number).toEqual('RCP001');
    });

    it('should create payment without medical record', async () => {
      const inputWithoutMedicalRecord = {
        ...testPaymentInput,
        medical_record_id: null
      };

      const result = await createPayment(inputWithoutMedicalRecord);

      expect(result.medical_record_id).toBeNull();
      expect(result.total_amount).toEqual(225.50);
    });

    it('should throw error for non-existent patient', async () => {
      const invalidInput = {
        ...testPaymentInput,
        patient_id: 99999
      };

      expect(createPayment(invalidInput)).rejects.toThrow(/patient not found/i);
    });

    it('should throw error for non-existent cashier', async () => {
      const invalidInput = {
        ...testPaymentInput,
        cashier_id: 99999
      };

      expect(createPayment(invalidInput)).rejects.toThrow(/cashier not found/i);
    });

    it('should throw error for inactive cashier', async () => {
      // Deactivate the cashier
      await db.update(usersTable)
        .set({ is_active: false })
        .where(eq(usersTable.id, userId))
        .execute();

      expect(createPayment(testPaymentInput)).rejects.toThrow(/cashier not found or inactive/i);
    });

    it('should throw error for non-existent medical record', async () => {
      const invalidInput = {
        ...testPaymentInput,
        medical_record_id: 99999
      };

      expect(createPayment(invalidInput)).rejects.toThrow(/medical record not found/i);
    });
  });

  describe('getPayments', () => {
    it('should return all payments', async () => {
      // Create multiple payments
      await createPayment(testPaymentInput);
      await createPayment({
        ...testPaymentInput,
        receipt_number: 'RCP002',
        doctor_service_fee: 200.00,
        medicine_fee: 50.00
      });

      const payments = await getPayments();

      expect(payments).toHaveLength(2);
      expect(payments[0].total_amount).toEqual(250.00); // Most recent first
      expect(payments[1].total_amount).toEqual(225.50);
    });

    it('should return empty array when no payments exist', async () => {
      const payments = await getPayments();
      expect(payments).toHaveLength(0);
    });
  });

  describe('getPaymentById', () => {
    it('should return payment by ID', async () => {
      const created = await createPayment(testPaymentInput);
      const payment = await getPaymentById(created.id);

      expect(payment).toBeDefined();
      expect(payment!.id).toEqual(created.id);
      expect(payment!.total_amount).toEqual(225.50);
      expect(payment!.receipt_number).toEqual('RCP001');
    });

    it('should return null for non-existent payment', async () => {
      const payment = await getPaymentById(99999);
      expect(payment).toBeNull();
    });
  });

  describe('getPaymentHistory', () => {
    let payment1Date: Date;
    let payment2Date: Date;

    beforeEach(async () => {
      payment1Date = new Date('2024-01-01T10:00:00Z');
      payment2Date = new Date('2024-01-15T10:00:00Z');

      // Create payments with specific dates
      await db.insert(paymentsTable)
        .values({
          patient_id: patientId,
          cashier_id: userId,
          doctor_service_fee: '100.00',
          medicine_fee: '50.00',
          total_amount: '150.00',
          receipt_number: 'RCP003',
          payment_date: payment1Date
        })
        .execute();

      await db.insert(paymentsTable)
        .values({
          patient_id: patientId,
          cashier_id: userId,
          doctor_service_fee: '200.00',
          medicine_fee: '75.00',
          total_amount: '275.00',
          receipt_number: 'RCP004',
          payment_date: payment2Date
        })
        .execute();
    });

    it('should return filtered payments by patient', async () => {
      const input: GetPaymentHistoryInput = {
        patient_id: patientId,
        limit: 50,
        offset: 0
      };

      const payments = await getPaymentHistory(input);

      expect(payments).toHaveLength(2);
      expect(payments[0].total_amount).toEqual(275.00); // Most recent first
      expect(payments[1].total_amount).toEqual(150.00);
    });

    it('should return filtered payments by date range', async () => {
      const input: GetPaymentHistoryInput = {
        start_date: new Date('2024-01-01'),
        end_date: new Date('2024-01-10'),
        limit: 50,
        offset: 0
      };

      const payments = await getPaymentHistory(input);

      expect(payments).toHaveLength(1);
      expect(payments[0].total_amount).toEqual(150.00);
    });

    it('should return paginated results', async () => {
      const input: GetPaymentHistoryInput = {
        limit: 1,
        offset: 1
      };

      const payments = await getPaymentHistory(input);

      expect(payments).toHaveLength(1);
      expect(payments[0].total_amount).toEqual(150.00); // Second payment
    });

    it('should return all payments when no filters applied', async () => {
      const input: GetPaymentHistoryInput = {
        limit: 50,
        offset: 0
      };

      const payments = await getPaymentHistory(input);

      expect(payments).toHaveLength(2);
    });
  });

  describe('getPaymentReceipt', () => {
    it('should return receipt data with patient and cashier info', async () => {
      const payment = await createPayment(testPaymentInput);
      const receipt = await getPaymentReceipt(payment.id);

      expect(receipt).toBeDefined();
      expect(receipt.payment.id).toEqual(payment.id);
      expect(receipt.payment.total_amount).toEqual(225.50);
      expect(receipt.patient.full_name).toEqual('Alice Johnson');
      expect(receipt.patient.medical_record_number).toEqual('MRN001');
      expect(receipt.cashier.full_name).toEqual('John Cashier');
    });

    it('should return null for non-existent payment', async () => {
      const receipt = await getPaymentReceipt(99999);
      expect(receipt).toBeNull();
    });
  });

  describe('getPaymentStatistics', () => {
    it('should return payment statistics', async () => {
      // Create payments for testing
      await createPayment(testPaymentInput);
      await createPayment({
        ...testPaymentInput,
        receipt_number: 'RCP005',
        doctor_service_fee: 100.00,
        medicine_fee: 25.00
      });

      const stats = await getPaymentStatistics();

      expect(stats).toBeDefined();
      expect(stats.today).toBeDefined();
      expect(stats.this_week).toBeDefined();
      expect(stats.this_month).toBeDefined();

      expect(typeof stats.today.total_amount).toBe('number');
      expect(typeof stats.today.transaction_count).toBe('number');
      expect(stats.today.transaction_count).toBeGreaterThan(0);
      expect(stats.today.total_amount).toBeGreaterThan(0);
    });

    it('should return zero stats when no payments exist', async () => {
      const stats = await getPaymentStatistics();

      expect(stats.today.total_amount).toEqual(0);
      expect(stats.today.transaction_count).toEqual(0);
      expect(stats.this_week.total_amount).toEqual(0);
      expect(stats.this_week.transaction_count).toEqual(0);
      expect(stats.this_month.total_amount).toEqual(0);
      expect(stats.this_month.transaction_count).toEqual(0);
    });
  });
});