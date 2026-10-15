/**
 * Purpose: protect permission text produced by project file-route helpers.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  permissionBitsToRwx,
} from '../../backend/server/file-routes.ts';

test('file route helpers render rwx permission bits for inspectable file metadata', () => {
  /**
   * Permission text must consistently map the three permission digits so users can identify access quickly.
   */
  assert.equal(permissionBitsToRwx(7), 'rwx');
  assert.equal(permissionBitsToRwx(6), 'rw-');
  assert.equal(permissionBitsToRwx(5), 'r-x');
  assert.equal(permissionBitsToRwx(0), '---');
});
