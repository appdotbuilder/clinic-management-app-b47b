import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { patientsTable } from '../db/schema';
import { type CreatePatientInput, type UpdatePatientInput, type SearchPatientInput } from '../schema';
import { 
  createPatient, 
  getPatients, 
  getPatientById, 
  updatePatient, 
  deletePatient, 
  searchPatients 
} from '../handlers/patients';
import { eq } from 'drizzle-orm';

// Test input data
const testPatientInput: CreatePatientInput = {
  medical_record_number: 'MRN001',
  full_name: 'John Doe',
  phone_number: '+1-555-0123',
  address: '123 Main St, Anytown, USA',
  date_of_birth: new Date('1990-01-15')
};

const testPatientInput2: CreatePatientInput = {
  medical_record_number: 'MRN002',
  full_name: 'Jane Smith',
  phone_number: '+1-555-0456',
  address: '456 Oak Ave, Somewhere, USA',
  date_of_birth: new Date('1985-07-22')
};

describe('Patient Handlers', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  describe('createPatient', () => {
    it('should create a patient successfully', async () => {
      const result = await createPatient(testPatientInput);

      expect(result.medical_record_number).toEqual('MRN001');
      expect(result.full_name).toEqual('John Doe');
      expect(result.phone_number).toEqual('+1-555-0123');
      expect(result.address).toEqual('123 Main St, Anytown, USA');
      expect(result.date_of_birth).toEqual(testPatientInput.date_of_birth);
      expect(result.id).toBeDefined();
      expect(result.created_at).toBeInstanceOf(Date);
      expect(result.updated_at).toBeInstanceOf(Date);
    });

    it('should save patient to database', async () => {
      const result = await createPatient(testPatientInput);

      const patients = await db.select()
        .from(patientsTable)
        .where(eq(patientsTable.id, result.id))
        .execute();

      expect(patients).toHaveLength(1);
      expect(patients[0].medical_record_number).toEqual('MRN001');
      expect(patients[0].full_name).toEqual('John Doe');
      expect(patients[0].created_at).toBeInstanceOf(Date);
    });

    it('should reject duplicate medical record numbers', async () => {
      await createPatient(testPatientInput);

      const duplicateInput: CreatePatientInput = {
        ...testPatientInput,
        full_name: 'Different Person'
      };

      await expect(createPatient(duplicateInput)).rejects.toThrow();
    });
  });

  describe('getPatients', () => {
    it('should return empty array when no patients exist', async () => {
      const result = await getPatients();
      expect(result).toEqual([]);
    });

    it('should return all patients', async () => {
      await createPatient(testPatientInput);
      await createPatient(testPatientInput2);

      const result = await getPatients();

      expect(result).toHaveLength(2);
      expect(result[0].full_name).toEqual('John Doe');
      expect(result[1].full_name).toEqual('Jane Smith');
    });
  });

  describe('getPatientById', () => {
    it('should return null when patient does not exist', async () => {
      const result = await getPatientById(999);
      expect(result).toBeNull();
    });

    it('should return patient when found', async () => {
      const created = await createPatient(testPatientInput);
      const result = await getPatientById(created.id);

      expect(result).not.toBeNull();
      expect(result!.id).toEqual(created.id);
      expect(result!.full_name).toEqual('John Doe');
      expect(result!.medical_record_number).toEqual('MRN001');
    });
  });

  describe('updatePatient', () => {
    it('should update patient successfully', async () => {
      const created = await createPatient(testPatientInput);

      const updateInput: UpdatePatientInput = {
        id: created.id,
        full_name: 'John Updated',
        phone_number: '+1-555-9999'
      };

      const result = await updatePatient(updateInput);

      expect(result.id).toEqual(created.id);
      expect(result.full_name).toEqual('John Updated');
      expect(result.phone_number).toEqual('+1-555-9999');
      expect(result.address).toEqual(testPatientInput.address); // Should remain unchanged
      expect(result.updated_at).not.toEqual(created.updated_at);
    });

    it('should update only provided fields', async () => {
      const created = await createPatient(testPatientInput);

      const updateInput: UpdatePatientInput = {
        id: created.id,
        address: 'New Address Only'
      };

      const result = await updatePatient(updateInput);

      expect(result.id).toEqual(created.id);
      expect(result.full_name).toEqual(testPatientInput.full_name); // Unchanged
      expect(result.phone_number).toEqual(testPatientInput.phone_number); // Unchanged
      expect(result.address).toEqual('New Address Only'); // Changed
    });

    it('should throw error when patient not found', async () => {
      const updateInput: UpdatePatientInput = {
        id: 999,
        full_name: 'Non-existent Patient'
      };

      await expect(updatePatient(updateInput)).rejects.toThrow(/not found/i);
    });

    it('should reject duplicate medical record numbers', async () => {
      const patient1 = await createPatient(testPatientInput);
      const patient2 = await createPatient(testPatientInput2);

      const updateInput: UpdatePatientInput = {
        id: patient2.id,
        medical_record_number: patient1.medical_record_number
      };

      await expect(updatePatient(updateInput)).rejects.toThrow();
    });
  });

  describe('deletePatient', () => {
    it('should delete patient successfully', async () => {
      const created = await createPatient(testPatientInput);
      const result = await deletePatient(created.id);

      expect(result.success).toBe(true);

      // Verify patient is deleted
      const found = await getPatientById(created.id);
      expect(found).toBeNull();
    });

    it('should return false when patient not found', async () => {
      const result = await deletePatient(999);
      expect(result.success).toBe(false);
    });
  });

  describe('searchPatients', () => {
    beforeEach(async () => {
      await createPatient(testPatientInput);
      await createPatient(testPatientInput2);
      
      // Add third patient for more comprehensive search testing
      await createPatient({
        medical_record_number: 'MRN003',
        full_name: 'Bob Johnson',
        phone_number: '+1-555-0789',
        address: '789 Pine St, Elsewhere, USA',
        date_of_birth: new Date('1975-12-10')
      });
    });

    it('should search by full name', async () => {
      const searchInput: SearchPatientInput = {
        query: 'John',
        limit: 50,
        offset: 0
      };

      const result = await searchPatients(searchInput);

      expect(result).toHaveLength(2); // John Doe and Bob Johnson
      expect(result.some(p => p.full_name === 'John Doe')).toBe(true);
      expect(result.some(p => p.full_name === 'Bob Johnson')).toBe(true);
    });

    it('should search by phone number', async () => {
      const searchInput: SearchPatientInput = {
        query: '555-0456',
        limit: 50,
        offset: 0
      };

      const result = await searchPatients(searchInput);

      expect(result).toHaveLength(1);
      expect(result[0].full_name).toEqual('Jane Smith');
    });

    it('should search by medical record number', async () => {
      const searchInput: SearchPatientInput = {
        query: 'MRN002',
        limit: 50,
        offset: 0
      };

      const result = await searchPatients(searchInput);

      expect(result).toHaveLength(1);
      expect(result[0].medical_record_number).toEqual('MRN002');
    });

    it('should support case-insensitive partial matching', async () => {
      const searchInput: SearchPatientInput = {
        query: 'jane',
        limit: 50,
        offset: 0
      };

      const result = await searchPatients(searchInput);

      expect(result).toHaveLength(1);
      expect(result[0].full_name).toEqual('Jane Smith');
    });

    it('should return empty array when no matches found', async () => {
      const searchInput: SearchPatientInput = {
        query: 'nonexistent',
        limit: 50,
        offset: 0
      };

      const result = await searchPatients(searchInput);
      expect(result).toEqual([]);
    });

    it('should respect pagination limits', async () => {
      const searchInput: SearchPatientInput = {
        query: 'MRN', // Should match all patients
        limit: 2,
        offset: 0
      };

      const result = await searchPatients(searchInput);
      expect(result).toHaveLength(2);
    });

    it('should respect pagination offset', async () => {
      const searchInput: SearchPatientInput = {
        query: 'MRN', // Should match all patients
        limit: 2,
        offset: 1
      };

      const result = await searchPatients(searchInput);
      expect(result).toHaveLength(2);
      
      // Should get different results than offset 0
      const firstPageInput: SearchPatientInput = {
        query: 'MRN',
        limit: 2,
        offset: 0
      };
      
      const firstPage = await searchPatients(firstPageInput);
      expect(result[0].id).not.toEqual(firstPage[0].id);
    });
  });
});