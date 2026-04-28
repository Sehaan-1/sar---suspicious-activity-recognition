const REQUIRED_ENV_VARS = ['JWT_SECRET', 'INGEST_API_KEY'] as const;

export function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function validateRequiredEnv(): void {
  for (const name of REQUIRED_ENV_VARS) {
    requireEnv(name);
  }
}
