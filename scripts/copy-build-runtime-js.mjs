#!/usr/bin/env node
/**
 * PURPOSE: Placeholder script kept for workflow compatibility while JS runtime copy
 * hand-off has been fully migrated to TypeScript compilation outputs.
 * Retain this compatibility entry; TypeScript output no longer needs an extra runtime copy.
 */
import { writeFile } from 'node:fs/promises';
import path from 'node:path';

await writeFile(
  path.join('dist-node', '.copy-build-runtime-js.mjs.marker'),
  'copy-build-runtime-js.mjs is retired: handwritten JavaScript runtime files are no longer copied.\\n',
);
