import { db } from '../db';
import { usersTable } from '../db/schema';
import { type User, type CreateUserInput, type UpdateUserInput } from '../schema';
import { eq } from 'drizzle-orm';

/**
 * Creates a new user account with hashed password
 * Only accessible by admin users
 */
export async function createUser(input: CreateUserInput): Promise<User> {
  try {
    // Hash the password using Bun's built-in password hashing
    const password_hash = await Bun.password.hash(input.password);

    // Insert user record
    const result = await db.insert(usersTable)
      .values({
        username: input.username,
        password_hash,
        full_name: input.full_name,
        role: input.role,
        is_active: input.is_active
      })
      .returning()
      .execute();

    return result[0];
  } catch (error) {
    console.error('User creation failed:', error);
    throw error;
  }
}

/**
 * Retrieves all users from the database
 * Only accessible by admin users
 */
export async function getUsers(): Promise<User[]> {
  try {
    const users = await db.select()
      .from(usersTable)
      .execute();

    return users;
  } catch (error) {
    console.error('Failed to retrieve users:', error);
    throw error;
  }
}

/**
 * Retrieves a specific user by ID
 * Only accessible by admin users
 */
export async function getUserById(id: number): Promise<User | null> {
  try {
    const users = await db.select()
      .from(usersTable)
      .where(eq(usersTable.id, id))
      .execute();

    return users[0] || null;
  } catch (error) {
    console.error('Failed to retrieve user by ID:', error);
    throw error;
  }
}

/**
 * Updates user information
 * Only accessible by admin users
 */
export async function updateUser(input: UpdateUserInput): Promise<User> {
  try {
    // Build update object
    const updateData: any = {};
    
    if (input.username !== undefined) {
      updateData.username = input.username;
    }
    if (input.password !== undefined) {
      updateData.password_hash = await Bun.password.hash(input.password);
    }
    if (input.full_name !== undefined) {
      updateData.full_name = input.full_name;
    }
    if (input.role !== undefined) {
      updateData.role = input.role;
    }
    if (input.is_active !== undefined) {
      updateData.is_active = input.is_active;
    }

    // Always update the updated_at timestamp
    updateData.updated_at = new Date();

    const result = await db.update(usersTable)
      .set(updateData)
      .where(eq(usersTable.id, input.id))
      .returning()
      .execute();

    if (result.length === 0) {
      throw new Error('User not found');
    }

    return result[0];
  } catch (error) {
    console.error('User update failed:', error);
    throw error;
  }
}

/**
 * Deletes a user account
 * Only accessible by admin users
 */
export async function deleteUser(id: number): Promise<{ success: boolean }> {
  try {
    const result = await db.delete(usersTable)
      .where(eq(usersTable.id, id))
      .returning()
      .execute();

    if (result.length === 0) {
      throw new Error('User not found');
    }

    return { success: true };
  } catch (error) {
    console.error('User deletion failed:', error);
    throw error;
  }
}