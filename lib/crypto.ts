import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;

export function encrypt(text: string): string {
  const key = Buffer.from(process.env.ENCRYPTION_KEY!, "base64");
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(text, "utf8", "base64");
  encrypted += cipher.final("base64");
  const authTag = cipher.getAuthTag();

  // Format: iv:authTag:encrypted
  return `${iv.toString("base64")}:${authTag.toString("base64")}:${encrypted}`;
}

export function decrypt(encryptedText: string): string {
  // Handle unencrypted legacy tokens (GitHub tokens start with ghp_, gho_, github_pat_, etc.)
  if (
    encryptedText.startsWith("ghp_") ||
    encryptedText.startsWith("gho_") ||
    encryptedText.startsWith("github_pat_")
  ) {
    return encryptedText;
  }

  const key = Buffer.from(process.env.ENCRYPTION_KEY!, "base64");
  const [ivB64, authTagB64, encrypted] = encryptedText.split(":");

  const iv = Buffer.from(ivB64, "base64");
  const authTag = Buffer.from(authTagB64, "base64");
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encrypted, "base64", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}
