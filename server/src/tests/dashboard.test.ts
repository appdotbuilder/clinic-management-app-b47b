import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { 
  usersTable, 
  patientsTable, 
  doctorsTable, 
  medicalRecordsTable, 
  paymentsTable 
} from '../db/schema';
import { getDashboardStats, getRecentActivities, getTodaysSchedule } from '../handlers/dashboard';

describe('dashboard handlers', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  describe('getDashboardStats', () => {
    it('should return admin dashboard stats', async () => {
      // Create test users
      const [adminUser] = await db.insert(usersTable).values({
        username: 'admin',
        password_hash: 'test_hash',
        full_name: 'Admin User',
        role: 'admin',
        is_active: true
      }).returning().execute();

      const [doctorUser] = await db.insert(usersTable).values({
        username: 'doctor1',
        password_hash: 'test_hash',
        full_name: 'Dr. Smith',
        role: 'doctor',
        is_active: true
      }).returning().execute();

      // Create test doctor
      const [doctor] = await db.insert(doctorsTable).values({
        user_id: doctorUser.id,
        specialization: 'General Medicine',
        practice_schedule: '{"monday": "9-17", "tuesday": "9-17"}'
      }).returning().execute();

      // Create test patients
      await db.insert(patientsTable).values([
        {
          medical_record_number: 'MRN001',
          full_name: 'John Doe',
          phone_number: '123-456-7890',
          address: '123 Main St',
          date_of_birth: new Date('1990-01-01')
        },
        {
          medical_record_number: 'MRN002',
          full_name: 'Jane Smith',
          phone_number: '123-456-7891',
          address: '456 Oak Ave',
          date_of_birth: new Date('1985-05-15')
        }
      ]).execute();

      const result = await getDashboardStats(adminUser.id, 'admin');

      expect(result.patients).toBeDefined();
      expect(result.patients.total).toEqual(2);
      expect(result.patients.new_today).toEqual(2);
      expect(result.patients.new_this_week).toEqual(2);
      
      expect(result.doctors).toBeDefined();
      expect(result.doctors.total).toEqual(1);
      expect(result.doctors.active_today).toEqual(0);
      
      expect(result.appointments_today).toEqual(0);
      expect(result.revenue).toBeDefined();
      expect(result.revenue.today).toEqual(0);
      expect(result.revenue.this_week).toEqual(0);
      expect(result.revenue.this_month).toEqual(0);
      expect(result.recent_activities).toBeDefined();
    });

    it('should return doctor dashboard stats', async () => {
      // Create test users
      const [doctorUser] = await db.insert(usersTable).values({
        username: 'doctor1',
        password_hash: 'test_hash',
        full_name: 'Dr. Smith',
        role: 'doctor',
        is_active: true
      }).returning().execute();

      // Create test doctor
      const [doctor] = await db.insert(doctorsTable).values({
        user_id: doctorUser.id,
        specialization: 'General Medicine',
        practice_schedule: '{"monday": "9-17", "tuesday": "9-17"}'
      }).returning().execute();

      // Create test patient
      const [patient] = await db.insert(patientsTable).values({
        medical_record_number: 'MRN001',
        full_name: 'John Doe',
        phone_number: '123-456-7890',
        address: '123 Main St',
        date_of_birth: new Date('1990-01-01')
      }).returning().execute();

      // Create medical record for today
      await db.insert(medicalRecordsTable).values({
        patient_id: patient.id,
        doctor_id: doctor.id,
        visit_date: new Date(),
        diagnosis: 'Common cold',
        prescription: 'Rest and fluids',
        notes: 'Patient feeling better'
      }).execute();

      const result = await getDashboardStats(doctorUser.id, 'doctor');

      expect(result.patients_today).toEqual(1);
      expect(result.total_patients_treated).toEqual(1);
      expect(result.recent_medical_records).toBeDefined();
      expect(result.recent_medical_records).toHaveLength(1);
      expect(result.upcoming_schedule).toBeDefined();
      expect(result.upcoming_schedule).toHaveLength(1);
    });

    it('should return receptionist dashboard stats', async () => {
      // Create test users
      const [receptionistUser] = await db.insert(usersTable).values({
        username: 'receptionist1',
        password_hash: 'test_hash',
        full_name: 'Receptionist User',
        role: 'receptionist',
        is_active: true
      }).returning().execute();

      const [doctorUser] = await db.insert(usersTable).values({
        username: 'doctor1',
        password_hash: 'test_hash',
        full_name: 'Dr. Smith',
        role: 'doctor',
        is_active: true
      }).returning().execute();

      // Create test patient
      const [patient] = await db.insert(patientsTable).values({
        medical_record_number: 'MRN001',
        full_name: 'John Doe',
        phone_number: '123-456-7890',
        address: '123 Main St',
        date_of_birth: new Date('1990-01-01')
      }).returning().execute();

      // Create test payment
      await db.insert(paymentsTable).values({
        patient_id: patient.id,
        medical_record_id: null,
        cashier_id: receptionistUser.id,
        doctor_service_fee: '50.00',
        medicine_fee: '25.00',
        total_amount: '75.00',
        receipt_number: 'REC001',
        payment_date: new Date()
      }).execute();

      const result = await getDashboardStats(receptionistUser.id, 'receptionist');

      expect(result.patients_registered_today).toEqual(1);
      expect(result.payments_processed_today).toEqual(1);
      expect(result.revenue_today).toEqual(75);
      expect(result.recent_payments).toBeDefined();
      expect(result.recent_payments).toHaveLength(1);
      expect(result.recent_payments[0].total_amount).toEqual(75);
    });

    it('should return empty object for unknown role', async () => {
      const result = await getDashboardStats(1, 'unknown');
      expect(result).toEqual({});
    });

    it('should handle doctor without doctor record', async () => {
      // Create doctor user but no doctor record
      const [doctorUser] = await db.insert(usersTable).values({
        username: 'doctor1',
        password_hash: 'test_hash',
        full_name: 'Dr. Smith',
        role: 'doctor',
        is_active: true
      }).returning().execute();

      const result = await getDashboardStats(doctorUser.id, 'doctor');

      expect(result.patients_today).toEqual(0);
      expect(result.total_patients_treated).toEqual(0);
      expect(result.recent_medical_records).toEqual([]);
      expect(result.upcoming_schedule).toEqual([]);
    });
  });

  describe('getRecentActivities', () => {
    it('should return recent activities across all entities', async () => {
      // Create test data with different timestamps
      const [doctorUser] = await db.insert(usersTable).values({
        username: 'doctor1',
        password_hash: 'test_hash',
        full_name: 'Dr. Smith',
        role: 'doctor',
        is_active: true
      }).returning().execute();

      const [receptionistUser] = await db.insert(usersTable).values({
        username: 'receptionist1',
        password_hash: 'test_hash',
        full_name: 'Receptionist User',
        role: 'receptionist',
        is_active: true
      }).returning().execute();

      const [doctor] = await db.insert(doctorsTable).values({
        user_id: doctorUser.id,
        specialization: 'General Medicine',
        practice_schedule: '{"monday": "9-17"}'
      }).returning().execute();

      // Create patient
      const [patient] = await db.insert(patientsTable).values({
        medical_record_number: 'MRN001',
        full_name: 'John Doe',
        phone_number: '123-456-7890',
        address: '123 Main St',
        date_of_birth: new Date('1990-01-01')
      }).returning().execute();

      // Create medical record
      const [medicalRecord] = await db.insert(medicalRecordsTable).values({
        patient_id: patient.id,
        doctor_id: doctor.id,
        visit_date: new Date(),
        diagnosis: 'Common cold',
        prescription: 'Rest and fluids'
      }).returning().execute();

      // Create payment
      await db.insert(paymentsTable).values({
        patient_id: patient.id,
        medical_record_id: medicalRecord.id,
        cashier_id: receptionistUser.id,
        doctor_service_fee: '50.00',
        medicine_fee: '25.00',
        total_amount: '75.00',
        receipt_number: 'REC001'
      }).execute();

      const result = await getRecentActivities();

      expect(result.length).toBeGreaterThan(0);
      expect(result.length).toBeLessThanOrEqual(10);

      // Check that activities have required properties
      result.forEach(activity => {
        expect(activity.type).toBeDefined();
        expect(activity.description).toBeDefined();
        expect(activity.timestamp).toBeDefined();
        expect(activity.entity_id).toBeDefined();
      });

      // Check that we have different types of activities
      const activityTypes = result.map(a => a.type);
      expect(activityTypes).toContain('patient_registration');
    });

    it('should return empty array when no data exists', async () => {
      const result = await getRecentActivities();
      expect(result).toEqual([]);
    });

    it('should limit results to 10 activities', async () => {
      // Create many patients to test limit
      const patients = [];
      for (let i = 1; i <= 12; i++) {
        patients.push({
          medical_record_number: `MRN${i.toString().padStart(3, '0')}`,
          full_name: `Patient ${i}`,
          phone_number: `123-456-78${i.toString().padStart(2, '0')}`,
          address: `${i} Main St`,
          date_of_birth: new Date('1990-01-01')
        });
      }
      
      await db.insert(patientsTable).values(patients).execute();

      const result = await getRecentActivities();
      expect(result.length).toBeLessThanOrEqual(10);
    });
  });

  describe('getTodaysSchedule', () => {
    it('should return today\'s schedule for all doctors', async () => {
      // Create test data
      const [doctorUser] = await db.insert(usersTable).values({
        username: 'doctor1',
        password_hash: 'test_hash',
        full_name: 'Dr. Smith',
        role: 'doctor',
        is_active: true
      }).returning().execute();

      const [doctor] = await db.insert(doctorsTable).values({
        user_id: doctorUser.id,
        specialization: 'General Medicine',
        practice_schedule: '{"monday": "9-17"}'
      }).returning().execute();

      const [patient] = await db.insert(patientsTable).values({
        medical_record_number: 'MRN001',
        full_name: 'John Doe',
        phone_number: '123-456-7890',
        address: '123 Main St',
        date_of_birth: new Date('1990-01-01')
      }).returning().execute();

      // Create medical record for today
      const today = new Date();
      await db.insert(medicalRecordsTable).values({
        patient_id: patient.id,
        doctor_id: doctor.id,
        visit_date: today,
        diagnosis: 'Common cold',
        prescription: 'Rest and fluids'
      }).execute();

      const result = await getTodaysSchedule();

      expect(result).toHaveLength(1);
      expect(result[0].patient_name).toEqual('John Doe');
      expect(result[0].doctor_name).toEqual('Dr. Smith');
      expect(result[0].diagnosis).toEqual('Common cold');
      expect(result[0].visit_date).toBeInstanceOf(Date);
    });

    it('should return today\'s schedule for specific doctor', async () => {
      // Create test data
      const [doctorUser1] = await db.insert(usersTable).values({
        username: 'doctor1',
        password_hash: 'test_hash',
        full_name: 'Dr. Smith',
        role: 'doctor',
        is_active: true
      }).returning().execute();

      const [doctorUser2] = await db.insert(usersTable).values({
        username: 'doctor2',
        password_hash: 'test_hash',
        full_name: 'Dr. Jones',
        role: 'doctor',
        is_active: true
      }).returning().execute();

      const [doctor1] = await db.insert(doctorsTable).values({
        user_id: doctorUser1.id,
        specialization: 'General Medicine',
        practice_schedule: '{"monday": "9-17"}'
      }).returning().execute();

      const [doctor2] = await db.insert(doctorsTable).values({
        user_id: doctorUser2.id,
        specialization: 'Pediatrics',
        practice_schedule: '{"monday": "10-18"}'
      }).returning().execute();

      const [patient] = await db.insert(patientsTable).values({
        medical_record_number: 'MRN001',
        full_name: 'John Doe',
        phone_number: '123-456-7890',
        address: '123 Main St',
        date_of_birth: new Date('1990-01-01')
      }).returning().execute();

      // Create medical records for both doctors today
      const today = new Date();
      await db.insert(medicalRecordsTable).values([
        {
          patient_id: patient.id,
          doctor_id: doctor1.id,
          visit_date: today,
          diagnosis: 'Common cold',
          prescription: 'Rest and fluids'
        },
        {
          patient_id: patient.id,
          doctor_id: doctor2.id,
          visit_date: today,
          diagnosis: 'Checkup',
          prescription: 'Vitamins'
        }
      ]).execute();

      // Get schedule for specific doctor
      const result = await getTodaysSchedule(doctorUser1.id);

      expect(result).toHaveLength(1);
      expect(result[0].doctor_name).toEqual('Dr. Smith');
      expect(result[0].diagnosis).toEqual('Common cold');
    });

    it('should return empty array when no appointments today', async () => {
      const result = await getTodaysSchedule();
      expect(result).toEqual([]);
    });

    it('should return empty array for doctor with no appointments', async () => {
      // Create doctor with no appointments
      const [doctorUser] = await db.insert(usersTable).values({
        username: 'doctor1',
        password_hash: 'test_hash',
        full_name: 'Dr. Smith',
        role: 'doctor',
        is_active: true
      }).returning().execute();

      await db.insert(doctorsTable).values({
        user_id: doctorUser.id,
        specialization: 'General Medicine',
        practice_schedule: '{"monday": "9-17"}'
      }).execute();

      const result = await getTodaysSchedule(doctorUser.id);
      expect(result).toEqual([]);
    });

    it('should handle doctor user without doctor record', async () => {
      // Create doctor user but no doctor record
      const [doctorUser] = await db.insert(usersTable).values({
        username: 'doctor1',
        password_hash: 'test_hash',
        full_name: 'Dr. Smith',
        role: 'doctor',
        is_active: true
      }).returning().execute();

      const result = await getTodaysSchedule(doctorUser.id);
      expect(result).toEqual([]);
    });

    it('should not include appointments from other days', async () => {
      // Create test data
      const [doctorUser] = await db.insert(usersTable).values({
        username: 'doctor1',
        password_hash: 'test_hash',
        full_name: 'Dr. Smith',
        role: 'doctor',
        is_active: true
      }).returning().execute();

      const [doctor] = await db.insert(doctorsTable).values({
        user_id: doctorUser.id,
        specialization: 'General Medicine',
        practice_schedule: '{"monday": "9-17"}'
      }).returning().execute();

      const [patient] = await db.insert(patientsTable).values({
        medical_record_number: 'MRN001',
        full_name: 'John Doe',
        phone_number: '123-456-7890',
        address: '123 Main St',
        date_of_birth: new Date('1990-01-01')
      }).returning().execute();

      // Create medical record for yesterday
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      await db.insert(medicalRecordsTable).values({
        patient_id: patient.id,
        doctor_id: doctor.id,
        visit_date: yesterday,
        diagnosis: 'Common cold',
        prescription: 'Rest and fluids'
      }).execute();

      const result = await getTodaysSchedule(doctorUser.id);
      expect(result).toEqual([]);
    });
  });
});