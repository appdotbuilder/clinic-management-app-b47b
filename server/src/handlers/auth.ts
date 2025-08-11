import { db } from '../db';
import { usersTable } from '../db/schema';
import { type LoginInput, type LoginResponse, type User } from '../schema';
import { eq } from 'drizzle-orm';
import { createHash, randomBytes } from 'crypto';

// JWT token structure for this implementation
interface TokenPayload {
  id: number;
  username: string;
  role: string;
  exp: number;
}

// Simple JWT implementation without external dependencies
const JWT_SECRET = process.env['JWT_SECRET'] || 'your-secret-key';
const TOKEN_EXPIRY_HOURS = 24;

function createSimpleJWT(payload: Omit<TokenPayload, 'exp'>): string {
  const header = { alg: 'HS256', typ: 'JWT' };
  const exp = Math.floor(Date.now() / 1000) + (TOKEN_EXPIRY_HOURS * 3600);
  const fullPayload = { ...payload, exp };
  
  const encodedHeader = Buffer.from(JSON.stringify(header)).toString('base64url');
  const encodedPayload = Buffer.from(JSON.stringify(fullPayload)).toString('base64url');
  
  const signature = createHash('sha256')
    .update(`${encodedHeader}.${encodedPayload}.${JWT_SECRET}`)
    .digest('base64url');
  
  return `${encodedHeader}.${encodedPayload}.${signature}`;
}

function verifySimpleJWT(token: string): TokenPayload | null {
  try {
    const [encodedHeader, encodedPayload, signature] = token.split('.');
    
    if (!encodedHeader || !encodedPayload || !signature) {
      return null;
    }
    
    // Verify signature
    const expectedSignature = createHash('sha256')
      .update(`${encodedHeader}.${encodedPayload}.${JWT_SECRET}`)
      .digest('base64url');
    
    if (signature !== expectedSignature) {
      return null;
    }
    
    // Decode payload
    const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString());
    
    // Check expiration
    if (payload.exp && Date.now() / 1000 > payload.exp) {
      return null;
    }
    
    return payload;
  } catch (error) {
    return null;
  }
}

function hashPassword(password: string, salt?: string): { hash: string; salt: string } {
  const passwordSalt = salt || randomBytes(16).toString('hex');
  const hash = createHash('sha256').update(password + passwordSalt).digest('hex');
  return { hash: `${hash}:${passwordSalt}`, salt: passwordSalt };
}

function verifyPassword(password: string, hashedPassword: string): boolean {
  try {
    const [hash, salt] = hashedPassword.split(':');
    const { hash: newHash } = hashPassword(password, salt);
    return newHash === hashedPassword;
  } catch (error) {
    return false;
  }
}

/**
 * Authenticates a user with username and password
 * Returns user information and authentication token on successful login
 */
export async function loginUser(input: LoginInput): Promise<LoginResponse> {
  try {
    // Find user by username
    const users = await db.select()
      .from(usersTable)
      .where(eq(usersTable.username, input.username))
      .limit(1)
      .execute();

    const user = users[0];
    
    if (!user) {
      throw new Error('Invalid username or password');
    }

    // Check if user is active
    if (!user.is_active) {
      throw new Error('Account is inactive');
    }

    // Verify password
    if (!verifyPassword(input.password, user.password_hash)) {
      throw new Error('Invalid username or password');
    }

    // Generate JWT token
    const token = createSimpleJWT({
      id: user.id,
      username: user.username,
      role: user.role
    });

    // Return user data and token
    const userResponse: User = {
      id: user.id,
      username: user.username,
      password_hash: user.password_hash,
      full_name: user.full_name,
      role: user.role,
      is_active: user.is_active,
      created_at: user.created_at,
      updated_at: user.updated_at
    };

    return {
      user: userResponse,
      token
    };
  } catch (error) {
    console.error('Login failed:', error);
    throw error;
  }
}

/**
 * Validates authentication token and returns user information
 */
export async function validateToken(token: string): Promise<{ id: number; username: string; role: string }> {
  try {
    // Verify and decode token
    const payload = verifySimpleJWT(token);
    
    if (!payload) {
      throw new Error('Invalid or expired token');
    }

    // Verify user still exists and is active
    const users = await db.select()
      .from(usersTable)
      .where(eq(usersTable.id, payload.id))
      .limit(1)
      .execute();

    const user = users[0];
    
    if (!user || !user.is_active) {
      throw new Error('User not found or inactive');
    }

    return {
      id: user.id,
      username: user.username,
      role: user.role
    };
  } catch (error) {
    console.error('Token validation failed:', error);
    throw error;
  }
}

/**
 * Utility function to hash a password (for creating users)
 */
export function createPasswordHash(password: string): string {
  return hashPassword(password).hash;
}