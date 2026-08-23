import { readdir, stat, unlink } from 'node:fs/promises';
import { join } from 'node:path';

export async function deleteIncomingFile(filePath: string): Promise<void> {
  try {
    await unlink(filePath);
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return;
    }
    throw error;
  }
}

export async function cleanupUntrackedFiles(
  uploadDir: string,
  tracked: ReadonlySet<string>,
  threshold: Date,
): Promise<number> {
  let removed = 0;
  for (const filename of await readdir(uploadDir).catch((error: unknown) => {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return [];
    }
    throw error;
  })) {
    if (tracked.has(filename)) continue;
    const filePath = join(uploadDir, filename);
    if ((await stat(filePath)).mtime >= threshold) continue;
    await deleteIncomingFile(filePath);
    removed += 1;
  }
  return removed;
}
