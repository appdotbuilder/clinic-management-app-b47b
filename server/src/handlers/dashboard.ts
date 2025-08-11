import { db } from '../db';
import { 
  usersTable, 
  patientsTable, 
  doctorsTable, 
  medicalRecordsTable, 
  paymentsTable 
} from '../db/schema';
import { eq, and, gte, lte, count, desc, isNotNull, SQL } from 'drizzle-orm';

/**
 * Gets dashboard statistics and overview data
 * Accessible by all authenticated users (content varies by role)
 */
export async function getDashboardStats(userId: number, userRole: string): Promise<any> {
  try {
    if (userRole === 'admin') {
      return await getAdminDashboardStats();
    }
    
    if (userRole === 'doctor') {
      return await getDoctorDashboardStats(userId);
    }
    
    if (userRole === 'receptionist') {
      return await getReceptionistDashboardStats();
    }
    
    return {};
  } catch (error) {
    console.error('Dashboard stats retrieval failed:', error);
    throw error;
  }
}

/**
 * Gets recent activities for the dashboard
 * Accessible by admin users
 */
export async function getRecentActivities(): Promise<any[]> {
  try {
    const activities: any[] = [];

    // Get recent patient registrations
    const recentPatients = await db.select({
      id: patientsTable.id,
      full_name: patientsTable.full_name,
      created_at: patientsTable.created_at
    })
    .from(patientsTable)
    .orderBy(desc(patientsTable.created_at))
    .limit(5)
    .execute();

    recentPatients.forEach(patient => {
      activities.push({
        type: 'patient_registration',
        description: `New patient registered: ${patient.full_name}`,
        timestamp: patient.created_at,
        entity_id: patient.id
      });
    });

    // Get recent medical records
    const recentRecords = await db.select({
      id: medicalRecordsTable.id,
      patient_name: patientsTable.full_name,
      doctor_name: usersTable.full_name,
      diagnosis: medicalRecordsTable.diagnosis,
      created_at: medicalRecordsTable.created_at
    })
    .from(medicalRecordsTable)
    .innerJoin(patientsTable, eq(medicalRecordsTable.patient_id, patientsTable.id))
    .innerJoin(doctorsTable, eq(medicalRecordsTable.doctor_id, doctorsTable.id))
    .innerJoin(usersTable, eq(doctorsTable.user_id, usersTable.id))
    .orderBy(desc(medicalRecordsTable.created_at))
    .limit(5)
    .execute();

    recentRecords.forEach(record => {
      activities.push({
        type: 'medical_record',
        description: `Medical record created for ${record.patient_name} by Dr. ${record.doctor_name}`,
        timestamp: record.created_at,
        entity_id: record.id
      });
    });

    // Get recent payments
    const recentPayments = await db.select({
      id: paymentsTable.id,
      patient_name: patientsTable.full_name,
      total_amount: paymentsTable.total_amount,
      receipt_number: paymentsTable.receipt_number,
      payment_date: paymentsTable.payment_date
    })
    .from(paymentsTable)
    .innerJoin(patientsTable, eq(paymentsTable.patient_id, patientsTable.id))
    .orderBy(desc(paymentsTable.payment_date))
    .limit(5)
    .execute();

    recentPayments.forEach(payment => {
      activities.push({
        type: 'payment',
        description: `Payment received from ${payment.patient_name} - $${parseFloat(payment.total_amount)}`,
        timestamp: payment.payment_date,
        entity_id: payment.id
      });
    });

    // Sort all activities by timestamp (most recent first)
    return activities
      .sort((a: any, b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, 10);

  } catch (error) {
    console.error('Recent activities retrieval failed:', error);
    throw error;
  }
}

/**
 * Gets today's schedule and appointments
 * Accessible by doctors and admin users
 */
export async function getTodaysSchedule(doctorId?: number): Promise<any[]> {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    let baseQuery = db.select({
      id: medicalRecordsTable.id,
      patient_id: medicalRecordsTable.patient_id,
      patient_name: patientsTable.full_name,
      patient_phone: patientsTable.phone_number,
      doctor_id: medicalRecordsTable.doctor_id,
      doctor_name: usersTable.full_name,
      visit_date: medicalRecordsTable.visit_date,
      diagnosis: medicalRecordsTable.diagnosis,
      prescription: medicalRecordsTable.prescription
    })
    .from(medicalRecordsTable)
    .innerJoin(patientsTable, eq(medicalRecordsTable.patient_id, patientsTable.id))
    .innerJoin(doctorsTable, eq(medicalRecordsTable.doctor_id, doctorsTable.id))
    .innerJoin(usersTable, eq(doctorsTable.user_id, usersTable.id));

    const conditions: SQL<unknown>[] = [
      gte(medicalRecordsTable.visit_date, today),
      lte(medicalRecordsTable.visit_date, tomorrow)
    ];

    if (doctorId !== undefined) {
      // Find doctor record by user_id
      const doctorRecord = await db.select({ id: doctorsTable.id })
        .from(doctorsTable)
        .where(eq(doctorsTable.user_id, doctorId))
        .limit(1)
        .execute();
      
      if (doctorRecord.length > 0) {
        conditions.push(eq(medicalRecordsTable.doctor_id, doctorRecord[0].id));
      }
    }

    const query = baseQuery
      .where(and(...conditions))
      .orderBy(medicalRecordsTable.visit_date);

    const results = await query.execute();

    return results.map(result => ({
      id: result.id,
      patient_id: result.patient_id,
      patient_name: result.patient_name,
      patient_phone: result.patient_phone,
      doctor_id: result.doctor_id,
      doctor_name: result.doctor_name,
      visit_date: result.visit_date,
      diagnosis: result.diagnosis,
      prescription: result.prescription
    }));

  } catch (error) {
    console.error('Today\'s schedule retrieval failed:', error);
    throw error;
  }
}

// Helper function for admin dashboard stats
async function getAdminDashboardStats(): Promise<any> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  
  const weekAgo = new Date(today);
  weekAgo.setDate(weekAgo.getDate() - 7);
  
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);

  // Get patient statistics
  const [totalPatients] = await db.select({ count: count() })
    .from(patientsTable)
    .execute();

  const [newPatientsToday] = await db.select({ count: count() })
    .from(patientsTable)
    .where(gte(patientsTable.created_at, today))
    .execute();

  const [newPatientsThisWeek] = await db.select({ count: count() })
    .from(patientsTable)
    .where(gte(patientsTable.created_at, weekAgo))
    .execute();

  // Get doctor statistics
  const [totalDoctors] = await db.select({ count: count() })
    .from(doctorsTable)
    .execute();

  const [activeDoctorsToday] = await db.select({ count: count() })
    .from(medicalRecordsTable)
    .where(and(
      gte(medicalRecordsTable.visit_date, today),
      lte(medicalRecordsTable.visit_date, tomorrow)
    ))
    .execute();

  // Get appointments today
  const [appointmentsToday] = await db.select({ count: count() })
    .from(medicalRecordsTable)
    .where(and(
      gte(medicalRecordsTable.visit_date, today),
      lte(medicalRecordsTable.visit_date, tomorrow)
    ))
    .execute();

  // Get revenue statistics
  const revenueToday = await db.select({ total: paymentsTable.total_amount })
    .from(paymentsTable)
    .where(gte(paymentsTable.payment_date, today))
    .execute();

  const revenueThisWeek = await db.select({ total: paymentsTable.total_amount })
    .from(paymentsTable)
    .where(gte(paymentsTable.payment_date, weekAgo))
    .execute();

  const revenueThisMonth = await db.select({ total: paymentsTable.total_amount })
    .from(paymentsTable)
    .where(gte(paymentsTable.payment_date, monthStart))
    .execute();

  const sumRevenue = (payments: { total: string }[]) => 
    payments.reduce((sum, payment) => sum + parseFloat(payment.total), 0);

  const recentActivities = await getRecentActivities();

  return {
    patients: {
      total: totalPatients.count,
      new_this_week: newPatientsThisWeek.count,
      new_today: newPatientsToday.count
    },
    doctors: {
      total: totalDoctors.count,
      active_today: activeDoctorsToday.count
    },
    appointments_today: appointmentsToday.count,
    revenue: {
      today: sumRevenue(revenueToday),
      this_week: sumRevenue(revenueThisWeek),
      this_month: sumRevenue(revenueThisMonth)
    },
    recent_activities: recentActivities
  };
}

// Helper function for doctor dashboard stats
async function getDoctorDashboardStats(userId: number): Promise<any> {
  // First find the doctor record
  const doctorRecord = await db.select({ id: doctorsTable.id })
    .from(doctorsTable)
    .where(eq(doctorsTable.user_id, userId))
    .limit(1)
    .execute();

  if (doctorRecord.length === 0) {
    return {
      patients_today: 0,
      total_patients_treated: 0,
      recent_medical_records: [],
      upcoming_schedule: []
    };
  }

  const doctorId = doctorRecord[0].id;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  // Get patients treated today
  const [patientsTodayResult] = await db.select({ count: count() })
    .from(medicalRecordsTable)
    .where(and(
      eq(medicalRecordsTable.doctor_id, doctorId),
      gte(medicalRecordsTable.visit_date, today),
      lte(medicalRecordsTable.visit_date, tomorrow)
    ))
    .execute();

  // Get total patients treated
  const [totalPatientsResult] = await db.select({ count: count() })
    .from(medicalRecordsTable)
    .where(eq(medicalRecordsTable.doctor_id, doctorId))
    .execute();

  // Get recent medical records
  const recentRecords = await db.select({
    id: medicalRecordsTable.id,
    patient_name: patientsTable.full_name,
    visit_date: medicalRecordsTable.visit_date,
    diagnosis: medicalRecordsTable.diagnosis,
    prescription: medicalRecordsTable.prescription
  })
  .from(medicalRecordsTable)
  .innerJoin(patientsTable, eq(medicalRecordsTable.patient_id, patientsTable.id))
  .where(eq(medicalRecordsTable.doctor_id, doctorId))
  .orderBy(desc(medicalRecordsTable.visit_date))
  .limit(5)
  .execute();

  const upcomingSchedule = await getTodaysSchedule(userId);

  return {
    patients_today: patientsTodayResult.count,
    total_patients_treated: totalPatientsResult.count,
    recent_medical_records: recentRecords,
    upcoming_schedule: upcomingSchedule
  };
}

// Helper function for receptionist dashboard stats
async function getReceptionistDashboardStats(): Promise<any> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Get patients registered today
  const [patientsRegisteredToday] = await db.select({ count: count() })
    .from(patientsTable)
    .where(gte(patientsTable.created_at, today))
    .execute();

  // Get payments processed today
  const [paymentsProcessedToday] = await db.select({ count: count() })
    .from(paymentsTable)
    .where(gte(paymentsTable.payment_date, today))
    .execute();

  // Get revenue today
  const revenueToday = await db.select({ total: paymentsTable.total_amount })
    .from(paymentsTable)
    .where(gte(paymentsTable.payment_date, today))
    .execute();

  const totalRevenueToday = revenueToday.reduce((sum, payment) => 
    sum + parseFloat(payment.total), 0);

  // Get recent payments
  const recentPayments = await db.select({
    id: paymentsTable.id,
    patient_name: patientsTable.full_name,
    total_amount: paymentsTable.total_amount,
    receipt_number: paymentsTable.receipt_number,
    payment_date: paymentsTable.payment_date
  })
  .from(paymentsTable)
  .innerJoin(patientsTable, eq(paymentsTable.patient_id, patientsTable.id))
  .orderBy(desc(paymentsTable.payment_date))
  .limit(5)
  .execute();

  const formattedRecentPayments = recentPayments.map(payment => ({
    id: payment.id,
    patient_name: payment.patient_name,
    total_amount: parseFloat(payment.total_amount),
    receipt_number: payment.receipt_number,
    payment_date: payment.payment_date
  }));

  return {
    patients_registered_today: patientsRegisteredToday.count,
    payments_processed_today: paymentsProcessedToday.count,
    revenue_today: totalRevenueToday,
    recent_payments: formattedRecentPayments
  };
}