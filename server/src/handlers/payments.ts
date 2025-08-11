import { db } from '../db';
import { paymentsTable, patientsTable, usersTable, medicalRecordsTable } from '../db/schema';
import { type Payment, type CreatePaymentInput, type GetPaymentHistoryInput } from '../schema';
import { eq, and, gte, lte, desc, sql, SQL } from 'drizzle-orm';

/**
 * Creates a new payment record and generates receipt
 * Accessible by receptionist/cashier and admin users
 */
export async function createPayment(input: CreatePaymentInput): Promise<Payment> {
  try {
    // Calculate total amount
    const total_amount = input.doctor_service_fee + input.medicine_fee;

    // Verify patient exists
    const patientExists = await db.select({ id: patientsTable.id })
      .from(patientsTable)
      .where(eq(patientsTable.id, input.patient_id))
      .execute();

    if (patientExists.length === 0) {
      throw new Error('Patient not found');
    }

    // Verify cashier exists and is active
    const cashierExists = await db.select({ id: usersTable.id, is_active: usersTable.is_active })
      .from(usersTable)
      .where(eq(usersTable.id, input.cashier_id))
      .execute();

    if (cashierExists.length === 0 || !cashierExists[0].is_active) {
      throw new Error('Cashier not found or inactive');
    }

    // Verify medical record exists if provided
    if (input.medical_record_id) {
      const medicalRecordExists = await db.select({ id: medicalRecordsTable.id })
        .from(medicalRecordsTable)
        .where(eq(medicalRecordsTable.id, input.medical_record_id))
        .execute();

      if (medicalRecordExists.length === 0) {
        throw new Error('Medical record not found');
      }
    }

    // Insert payment record
    const result = await db.insert(paymentsTable)
      .values({
        patient_id: input.patient_id,
        medical_record_id: input.medical_record_id || null,
        cashier_id: input.cashier_id,
        doctor_service_fee: input.doctor_service_fee.toString(),
        medicine_fee: input.medicine_fee.toString(),
        total_amount: total_amount.toString(),
        receipt_number: input.receipt_number
      })
      .returning()
      .execute();

    // Convert numeric fields back to numbers
    const payment = result[0];
    return {
      ...payment,
      doctor_service_fee: parseFloat(payment.doctor_service_fee),
      medicine_fee: parseFloat(payment.medicine_fee),
      total_amount: parseFloat(payment.total_amount)
    };
  } catch (error) {
    console.error('Payment creation failed:', error);
    throw error;
  }
}

/**
 * Retrieves all payments with patient and cashier information
 * Accessible by admin and receptionist users
 */
export async function getPayments(): Promise<Payment[]> {
  try {
    const results = await db.select()
      .from(paymentsTable)
      .orderBy(desc(paymentsTable.created_at))
      .execute();

    return results.map(payment => ({
      ...payment,
      doctor_service_fee: parseFloat(payment.doctor_service_fee),
      medicine_fee: parseFloat(payment.medicine_fee),
      total_amount: parseFloat(payment.total_amount)
    }));
  } catch (error) {
    console.error('Failed to fetch payments:', error);
    throw error;
  }
}

/**
 * Retrieves a specific payment by ID
 * Accessible by admin, receptionist, and the cashier who processed it
 */
export async function getPaymentById(id: number): Promise<Payment | null> {
  try {
    const results = await db.select()
      .from(paymentsTable)
      .where(eq(paymentsTable.id, id))
      .execute();

    if (results.length === 0) {
      return null;
    }

    const payment = results[0];
    return {
      ...payment,
      doctor_service_fee: parseFloat(payment.doctor_service_fee),
      medicine_fee: parseFloat(payment.medicine_fee),
      total_amount: parseFloat(payment.total_amount)
    };
  } catch (error) {
    console.error('Failed to fetch payment by ID:', error);
    throw error;
  }
}

/**
 * Gets payment history with filtering options
 * Accessible by admin and receptionist users
 */
export async function getPaymentHistory(input: GetPaymentHistoryInput): Promise<Payment[]> {
  try {
    const conditions: SQL<unknown>[] = [];

    if (input.patient_id !== undefined) {
      conditions.push(eq(paymentsTable.patient_id, input.patient_id));
    }

    if (input.start_date !== undefined) {
      conditions.push(gte(paymentsTable.payment_date, input.start_date));
    }

    if (input.end_date !== undefined) {
      conditions.push(lte(paymentsTable.payment_date, input.end_date));
    }

    // Build the complete query in one chain to maintain proper types
    const baseQuery = db.select().from(paymentsTable);
    
    const results = conditions.length > 0
      ? await baseQuery
          .where(conditions.length === 1 ? conditions[0] : and(...conditions))
          .orderBy(desc(paymentsTable.payment_date))
          .limit(input.limit)
          .offset(input.offset)
          .execute()
      : await baseQuery
          .orderBy(desc(paymentsTable.payment_date))
          .limit(input.limit)
          .offset(input.offset)
          .execute();

    return results.map(payment => ({
      ...payment,
      doctor_service_fee: parseFloat(payment.doctor_service_fee),
      medicine_fee: parseFloat(payment.medicine_fee),
      total_amount: parseFloat(payment.total_amount)
    }));
  } catch (error) {
    console.error('Failed to fetch payment history:', error);
    throw error;
  }
}

/**
 * Generates payment receipt data
 * Accessible by admin, receptionist, and the cashier who processed the payment
 */
export async function getPaymentReceipt(paymentId: number): Promise<any> {
  try {
    const results = await db.select({
      payment: paymentsTable,
      patient: {
        full_name: patientsTable.full_name,
        medical_record_number: patientsTable.medical_record_number
      },
      cashier: {
        full_name: usersTable.full_name
      }
    })
      .from(paymentsTable)
      .innerJoin(patientsTable, eq(paymentsTable.patient_id, patientsTable.id))
      .innerJoin(usersTable, eq(paymentsTable.cashier_id, usersTable.id))
      .where(eq(paymentsTable.id, paymentId))
      .execute();

    if (results.length === 0) {
      return null;
    }

    const result = results[0];
    return {
      payment: {
        ...result.payment,
        doctor_service_fee: parseFloat(result.payment.doctor_service_fee),
        medicine_fee: parseFloat(result.payment.medicine_fee),
        total_amount: parseFloat(result.payment.total_amount)
      },
      patient: result.patient,
      cashier: result.cashier
    };
  } catch (error) {
    console.error('Failed to fetch payment receipt:', error);
    throw error;
  }
}

/**
 * Gets payment statistics for dashboard
 * Accessible by admin users
 */
export async function getPaymentStatistics(): Promise<any> {
  try {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekStart = new Date(todayStart);
    weekStart.setDate(weekStart.getDate() - 7);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    // Today's stats
    const todayStats = await db.select({
      total_amount: sql<string>`COALESCE(SUM(${paymentsTable.total_amount}), 0)`,
      transaction_count: sql<string>`COUNT(*)`
    })
      .from(paymentsTable)
      .where(gte(paymentsTable.payment_date, todayStart))
      .execute();

    // This week's stats
    const weekStats = await db.select({
      total_amount: sql<string>`COALESCE(SUM(${paymentsTable.total_amount}), 0)`,
      transaction_count: sql<string>`COUNT(*)`
    })
      .from(paymentsTable)
      .where(gte(paymentsTable.payment_date, weekStart))
      .execute();

    // This month's stats
    const monthStats = await db.select({
      total_amount: sql<string>`COALESCE(SUM(${paymentsTable.total_amount}), 0)`,
      transaction_count: sql<string>`COUNT(*)`
    })
      .from(paymentsTable)
      .where(gte(paymentsTable.payment_date, monthStart))
      .execute();

    return {
      today: {
        total_amount: parseFloat(todayStats[0].total_amount),
        transaction_count: parseInt(todayStats[0].transaction_count)
      },
      this_week: {
        total_amount: parseFloat(weekStats[0].total_amount),
        transaction_count: parseInt(weekStats[0].transaction_count)
      },
      this_month: {
        total_amount: parseFloat(monthStats[0].total_amount),
        transaction_count: parseInt(monthStats[0].transaction_count)
      }
    };
  } catch (error) {
    console.error('Failed to fetch payment statistics:', error);
    throw error;
  }
}