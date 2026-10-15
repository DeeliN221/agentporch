/**
 * Read and write the hidden-project archive index.
 * Keep archive storage separate from project discovery.
 */

import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';

const PROJECT_ARCHIVE_FILE_NAME = 'project-archive.json';
const PROJECT_ARCHIVE_VERSION = 1;

export type ProjectArchiveIndex = {
  version: number;
  archivedProjects: Record<string, any>;
};

/**
 * Build the default archive-index structure.
 */
export function createDefaultProjectArchiveIndex(): ProjectArchiveIndex {
  return {
    version: PROJECT_ARCHIVE_VERSION,
    archivedProjects: {},
  };
}

/**
 * Normalize archive content, supporting missing fields and legacy formats.
 */
export function normalizeProjectArchiveIndex(rawIndex: unknown): ProjectArchiveIndex {
  if (!rawIndex || typeof rawIndex !== 'object') {
    return createDefaultProjectArchiveIndex();
  }
  const candidate = rawIndex as Partial<ProjectArchiveIndex>;
  return {
    version: Number.isInteger(candidate.version) ? candidate.version as number : PROJECT_ARCHIVE_VERSION,
    archivedProjects: candidate.archivedProjects && typeof candidate.archivedProjects === 'object'
      ? candidate.archivedProjects
      : {},
  };
}

/**
 * Resolve the archive index, defaulting to ~/.claude/project-archive.json.
 */
export function getProjectArchiveFilePath(homeDir = os.homedir()): string {
  return path.join(homeDir, '.claude', PROJECT_ARCHIVE_FILE_NAME);
}

/**
 * Read the index from disk, returning defaults when missing or malformed.
 */
export async function loadProjectArchiveIndex(options: { archivePath?: string; homeDir?: string } = {}): Promise<ProjectArchiveIndex> {
  const archivePath = options.archivePath || getProjectArchiveFilePath(options.homeDir);
  try {
    const archiveData = await fs.readFile(archivePath, 'utf8');
    const parsed = JSON.parse(archiveData);
    return normalizeProjectArchiveIndex(parsed);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      console.warn(`Failed to parse project archive index (${archivePath}):`, (error as Error).message);
    }
    return createDefaultProjectArchiveIndex();
  }
}

/**
 * Write the project archive index to disk.
 */
export async function saveProjectArchiveIndex(
  archiveIndex: ProjectArchiveIndex,
  options: { archivePath?: string; homeDir?: string } = {},
): Promise<void> {
  const archivePath = options.archivePath || getProjectArchiveFilePath(options.homeDir);
  const normalizedArchive = normalizeProjectArchiveIndex(archiveIndex);
  await fs.mkdir(path.dirname(archivePath), { recursive: true });
  await fs.writeFile(archivePath, JSON.stringify(normalizedArchive, null, 2), 'utf8');
}
