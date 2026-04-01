export interface TokenData {
  userId: number;
  expiresAt: Date;
}

// Global in-memory token store
// In a distributed environment, this should be replaced with Redis or a database table
export const passwordResetTokens = new Map<string, TokenData>();
