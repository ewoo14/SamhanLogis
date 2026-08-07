export function resolveQaCredential(
  key?: string,
  options?: { env?: Record<string, string | undefined>; envFilePath?: string },
): string
export function parseEnvFile(filePath: string): Record<string, string>
export const REPO_ENV_FILE: string
