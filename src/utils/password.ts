import crypto from 'crypto';

/** Generates a password satisfying standard Keycloak security policies:
 * - Minimum 12 characters
 * - At least one uppercase letter
 * - At least one lowercase letter
 * - At least one digit
 * - At least one special character
 */
export const generateSecureTemporaryPassword = (): string => {
  const lowercase = 'abcdefghijklmnopqrstuvwxyz';
  const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const numbers = '0123456789';
  const special = '!@#$%^&*()_+-=[]{}|;:,.<>?';

  const getRandomChar = (charset: string) => charset[crypto.randomInt(0, charset.length)];

  const passwordChars = [
    getRandomChar(lowercase),
    getRandomChar(uppercase),
    getRandomChar(numbers),
    getRandomChar(special),
  ];

  const allChars = lowercase + uppercase + numbers + special;
  for (let i = 4; i < 12; i++) {
    passwordChars.push(getRandomChar(allChars));
  }

  // Shuffle the array using Fisher-Yates algorithm
  for (let i = passwordChars.length - 1; i > 0; i--) {
    const j = crypto.randomInt(0, i + 1);
    const temp = passwordChars[i];
    passwordChars[i] = passwordChars[j];
    passwordChars[j] = temp;
  }

  return passwordChars.join('');
};
