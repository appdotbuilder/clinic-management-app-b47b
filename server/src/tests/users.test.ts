import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { usersTable } from '../db/schema';
import { type CreateUserInput, type UpdateUserInput } from '../schema';
import { createUser, getUsers, getUserById, updateUser, deleteUser } from '../handlers/users';
import { eq } from 'drizzle-orm';

// Test input data
const testUserInput: CreateUserInput = {
  username: 'testuser',
  password: 'testpassword123',
  full_name: 'Test User',
  role: 'doctor',
  is_active: true
};

const testAdminInput: CreateUserInput = {
  username: 'admin',
  password: 'adminpassword123',
  full_name: 'Admin User',
  role: 'admin',
  is_active: true
};

describe('User handlers', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  describe('createUser', () => {
    it('should create a user with hashed password', async () => {
      const result = await createUser(testUserInput);

      expect(result.username).toEqual('testuser');
      expect(result.full_name).toEqual('Test User');
      expect(result.role).toEqual('doctor');
      expect(result.is_active).toEqual(true);
      expect(result.id).toBeDefined();
      expect(result.created_at).toBeInstanceOf(Date);
      expect(result.updated_at).toBeInstanceOf(Date);
      expect(result.password_hash).toBeDefined();
      expect(result.password_hash).not.toEqual('testpassword123'); // Should be hashed

      // Verify password was hashed correctly
      const isValidPassword = await Bun.password.verify('testpassword123', result.password_hash);
      expect(isValidPassword).toBe(true);
    });

    it('should save user to database', async () => {
      const result = await createUser(testUserInput);

      const users = await db.select()
        .from(usersTable)
        .where(eq(usersTable.id, result.id))
        .execute();

      expect(users).toHaveLength(1);
      expect(users[0].username).toEqual('testuser');
      expect(users[0].full_name).toEqual('Test User');
      expect(users[0].role).toEqual('doctor');
      expect(users[0].is_active).toEqual(true);
    });

    it('should use default is_active value', async () => {
      const inputWithDefaults: CreateUserInput = {
        username: 'defaultuser',
        password: 'password123',
        full_name: 'Default User',
        role: 'receptionist',
        is_active: true // Zod default applied
      };

      const result = await createUser(inputWithDefaults);
      expect(result.is_active).toEqual(true);
    });

    it('should throw error for duplicate username', async () => {
      await createUser(testUserInput);
      
      expect(createUser(testUserInput)).rejects.toThrow();
    });
  });

  describe('getUsers', () => {
    it('should return empty array when no users exist', async () => {
      const result = await getUsers();
      expect(result).toEqual([]);
    });

    it('should return all users', async () => {
      await createUser(testUserInput);
      await createUser(testAdminInput);

      const result = await getUsers();
      expect(result).toHaveLength(2);
      
      const usernames = result.map(user => user.username);
      expect(usernames).toContain('testuser');
      expect(usernames).toContain('admin');
    });

    it('should return users with all fields', async () => {
      await createUser(testUserInput);
      
      const result = await getUsers();
      const user = result[0];
      
      expect(user.id).toBeDefined();
      expect(user.username).toBeDefined();
      expect(user.password_hash).toBeDefined();
      expect(user.full_name).toBeDefined();
      expect(user.role).toBeDefined();
      expect(user.is_active).toBeDefined();
      expect(user.created_at).toBeInstanceOf(Date);
      expect(user.updated_at).toBeInstanceOf(Date);
    });
  });

  describe('getUserById', () => {
    it('should return null when user does not exist', async () => {
      const result = await getUserById(999);
      expect(result).toBeNull();
    });

    it('should return user when found', async () => {
      const createdUser = await createUser(testUserInput);
      
      const result = await getUserById(createdUser.id);
      expect(result).not.toBeNull();
      expect(result!.id).toEqual(createdUser.id);
      expect(result!.username).toEqual('testuser');
      expect(result!.full_name).toEqual('Test User');
      expect(result!.role).toEqual('doctor');
    });

    it('should return user with all fields', async () => {
      const createdUser = await createUser(testUserInput);
      
      const result = await getUserById(createdUser.id);
      
      expect(result!.id).toBeDefined();
      expect(result!.username).toBeDefined();
      expect(result!.password_hash).toBeDefined();
      expect(result!.full_name).toBeDefined();
      expect(result!.role).toBeDefined();
      expect(result!.is_active).toBeDefined();
      expect(result!.created_at).toBeInstanceOf(Date);
      expect(result!.updated_at).toBeInstanceOf(Date);
    });
  });

  describe('updateUser', () => {
    it('should update username only', async () => {
      const createdUser = await createUser(testUserInput);
      
      const updateInput: UpdateUserInput = {
        id: createdUser.id,
        username: 'updateduser'
      };

      const result = await updateUser(updateInput);
      expect(result.username).toEqual('updateduser');
      expect(result.full_name).toEqual('Test User'); // Unchanged
      expect(result.role).toEqual('doctor'); // Unchanged
      expect(result.is_active).toEqual(true); // Unchanged
    });

    it('should update password with hashing', async () => {
      const createdUser = await createUser(testUserInput);
      
      const updateInput: UpdateUserInput = {
        id: createdUser.id,
        password: 'newpassword123'
      };

      const result = await updateUser(updateInput);
      expect(result.password_hash).not.toEqual(createdUser.password_hash);
      
      // Verify new password was hashed correctly
      const isValidPassword = await Bun.password.verify('newpassword123', result.password_hash);
      expect(isValidPassword).toBe(true);
      
      // Verify old password no longer works
      const isOldPasswordValid = await Bun.password.verify('testpassword123', result.password_hash);
      expect(isOldPasswordValid).toBe(false);
    });

    it('should update multiple fields', async () => {
      const createdUser = await createUser(testUserInput);
      
      const updateInput: UpdateUserInput = {
        id: createdUser.id,
        username: 'updateduser',
        full_name: 'Updated User Name',
        role: 'admin',
        is_active: false
      };

      const result = await updateUser(updateInput);
      expect(result.username).toEqual('updateduser');
      expect(result.full_name).toEqual('Updated User Name');
      expect(result.role).toEqual('admin');
      expect(result.is_active).toEqual(false);
      expect(result.updated_at.getTime()).toBeGreaterThan(createdUser.updated_at.getTime());
    });

    it('should update database record', async () => {
      const createdUser = await createUser(testUserInput);
      
      const updateInput: UpdateUserInput = {
        id: createdUser.id,
        username: 'updateduser'
      };

      await updateUser(updateInput);

      const dbUser = await db.select()
        .from(usersTable)
        .where(eq(usersTable.id, createdUser.id))
        .execute();

      expect(dbUser[0].username).toEqual('updateduser');
    });

    it('should throw error when user does not exist', async () => {
      const updateInput: UpdateUserInput = {
        id: 999,
        username: 'nonexistent'
      };

      expect(updateUser(updateInput)).rejects.toThrow(/User not found/);
    });

    it('should throw error for duplicate username', async () => {
      const user1 = await createUser(testUserInput);
      await createUser(testAdminInput);
      
      const updateInput: UpdateUserInput = {
        id: user1.id,
        username: 'admin' // Duplicate username
      };

      expect(updateUser(updateInput)).rejects.toThrow();
    });
  });

  describe('deleteUser', () => {
    it('should delete existing user', async () => {
      const createdUser = await createUser(testUserInput);
      
      const result = await deleteUser(createdUser.id);
      expect(result.success).toBe(true);

      // Verify user was deleted from database
      const dbUsers = await db.select()
        .from(usersTable)
        .where(eq(usersTable.id, createdUser.id))
        .execute();

      expect(dbUsers).toHaveLength(0);
    });

    it('should throw error when user does not exist', async () => {
      expect(deleteUser(999)).rejects.toThrow(/User not found/);
    });

    it('should not affect other users', async () => {
      const user1 = await createUser(testUserInput);
      const user2 = await createUser(testAdminInput);
      
      await deleteUser(user1.id);

      // Verify second user still exists
      const remainingUser = await getUserById(user2.id);
      expect(remainingUser).not.toBeNull();
      expect(remainingUser!.username).toEqual('admin');
    });
  });
});