import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { usersTable } from '../db/schema';
import { type LoginInput, type UserRole } from '../schema';
import { loginUser, validateToken, createPasswordHash } from '../handlers/auth';
import { eq } from 'drizzle-orm';

// Test user data
const testUser = {
  username: 'testuser',
  password: 'password123',
  full_name: 'Test User',
  role: 'doctor' as UserRole,
  is_active: true
};

const adminUser = {
  username: 'admin',
  password: 'admin123',
  full_name: 'Admin User',
  role: 'admin' as UserRole,
  is_active: true
};

const inactiveUser = {
  username: 'inactive',
  password: 'inactive123',
  full_name: 'Inactive User',
  role: 'receptionist' as UserRole,
  is_active: false
};

describe('Authentication handlers', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  describe('loginUser', () => {
    beforeEach(async () => {
      // Create test users
      await db.insert(usersTable).values([
        {
          username: testUser.username,
          password_hash: createPasswordHash(testUser.password),
          full_name: testUser.full_name,
          role: testUser.role,
          is_active: testUser.is_active
        },
        {
          username: adminUser.username,
          password_hash: createPasswordHash(adminUser.password),
          full_name: adminUser.full_name,
          role: adminUser.role,
          is_active: adminUser.is_active
        },
        {
          username: inactiveUser.username,
          password_hash: createPasswordHash(inactiveUser.password),
          full_name: inactiveUser.full_name,
          role: inactiveUser.role,
          is_active: inactiveUser.is_active
        }
      ]).execute();
    });

    it('should successfully authenticate valid user', async () => {
      const loginInput: LoginInput = {
        username: testUser.username,
        password: testUser.password
      };

      const result = await loginUser(loginInput);

      expect(result.user).toBeDefined();
      expect(result.user.username).toEqual(testUser.username);
      expect(result.user.full_name).toEqual(testUser.full_name);
      expect(result.user.role).toEqual(testUser.role);
      expect(result.user.is_active).toBe(true);
      expect(result.user.id).toBeDefined();
      expect(result.user.created_at).toBeInstanceOf(Date);
      expect(result.user.updated_at).toBeInstanceOf(Date);

      expect(result.token).toBeDefined();
      expect(typeof result.token).toBe('string');
      expect(result.token.length).toBeGreaterThan(0);
    });

    it('should authenticate admin user', async () => {
      const loginInput: LoginInput = {
        username: adminUser.username,
        password: adminUser.password
      };

      const result = await loginUser(loginInput);

      expect(result.user.username).toEqual(adminUser.username);
      expect(result.user.role).toEqual('admin');
      expect(result.token).toBeDefined();
    });

    it('should reject invalid username', async () => {
      const loginInput: LoginInput = {
        username: 'nonexistent',
        password: 'password123'
      };

      await expect(loginUser(loginInput)).rejects.toThrow(/invalid username or password/i);
    });

    it('should reject invalid password', async () => {
      const loginInput: LoginInput = {
        username: testUser.username,
        password: 'wrongpassword'
      };

      await expect(loginUser(loginInput)).rejects.toThrow(/invalid username or password/i);
    });

    it('should reject inactive user', async () => {
      const loginInput: LoginInput = {
        username: inactiveUser.username,
        password: inactiveUser.password
      };

      await expect(loginUser(loginInput)).rejects.toThrow(/account is inactive/i);
    });

    it('should reject empty username', async () => {
      const loginInput: LoginInput = {
        username: '',
        password: 'password123'
      };

      await expect(loginUser(loginInput)).rejects.toThrow(/invalid username or password/i);
    });

    it('should reject empty password', async () => {
      const loginInput: LoginInput = {
        username: testUser.username,
        password: ''
      };

      await expect(loginUser(loginInput)).rejects.toThrow(/invalid username or password/i);
    });
  });

  describe('validateToken', () => {
    let validToken: string;
    let userId: number;

    beforeEach(async () => {
      // Create test user
      const result = await db.insert(usersTable).values({
        username: testUser.username,
        password_hash: createPasswordHash(testUser.password),
        full_name: testUser.full_name,
        role: testUser.role,
        is_active: testUser.is_active
      }).returning().execute();

      userId = result[0].id;

      // Login to get valid token
      const loginInput: LoginInput = {
        username: testUser.username,
        password: testUser.password
      };

      const loginResult = await loginUser(loginInput);
      validToken = loginResult.token;
    });

    it('should validate valid token', async () => {
      const result = await validateToken(validToken);

      expect(result.id).toEqual(userId);
      expect(result.username).toEqual(testUser.username);
      expect(result.role).toEqual(testUser.role);
    });

    it('should reject invalid token format', async () => {
      await expect(validateToken('invalid-token')).rejects.toThrow(/invalid or expired token/i);
    });

    it('should reject empty token', async () => {
      await expect(validateToken('')).rejects.toThrow(/invalid or expired token/i);
    });

    it('should reject malformed token', async () => {
      await expect(validateToken('header.payload')).rejects.toThrow(/invalid or expired token/i);
    });

    it('should reject token with invalid signature', async () => {
      const fakeToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MSwidXNlcm5hbWUiOiJ0ZXN0IiwiaWF0IjoxNjAwMDAwMDAwfQ.fakesignature';
      await expect(validateToken(fakeToken)).rejects.toThrow(/invalid or expired token/i);
    });

    it('should reject token for inactive user', async () => {
      // Deactivate the user
      await db.update(usersTable)
        .set({ is_active: false })
        .where(eq(usersTable.id, userId))
        .execute();

      await expect(validateToken(validToken)).rejects.toThrow(/user not found or inactive/i);
    });

    it('should reject token for deleted user', async () => {
      // Delete the user
      await db.delete(usersTable)
        .where(eq(usersTable.id, userId))
        .execute();

      await expect(validateToken(validToken)).rejects.toThrow(/user not found or inactive/i);
    });
  });

  describe('createPasswordHash', () => {
    it('should create password hash', async () => {
      const password = 'testpassword123';
      const hash = createPasswordHash(password);

      expect(hash).toBeDefined();
      expect(typeof hash).toBe('string');
      expect(hash.length).toBeGreaterThan(0);
      expect(hash).not.toEqual(password);
      expect(hash.includes(':')).toBe(true); // Should contain salt separator
    });

    it('should create different hashes for same password', async () => {
      const password = 'testpassword123';
      const hash1 = createPasswordHash(password);
      const hash2 = createPasswordHash(password);

      expect(hash1).not.toEqual(hash2);
    });

    it('should work with user creation and login', async () => {
      const password = 'newuserpass123';
      const hash = createPasswordHash(password);

      // Create user with hashed password
      await db.insert(usersTable).values({
        username: 'newuser',
        password_hash: hash,
        full_name: 'New User',
        role: 'doctor',
        is_active: true
      }).execute();

      // Should be able to login with original password
      const loginResult = await loginUser({
        username: 'newuser',
        password: password
      });

      expect(loginResult.user.username).toEqual('newuser');
      expect(loginResult.token).toBeDefined();
    });
  });
});