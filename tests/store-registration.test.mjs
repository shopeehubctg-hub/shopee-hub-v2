import assert from 'node:assert/strict';
import test from 'node:test';
import { proposedStoreId, storeIdConflict, storeNameConflict } from '../app/store-registration.ts';

const stores = [
  { id: 'shopee-scale-story-sg', name: 'Scale Story SG', bigseller_name: 'Scale Story SG by CTG4u', display_name: 'Scale Story Singapore' },
  { id: 'shopee-abc', name: 'Other Store', bigseller_name: 'Other Source' },
];

test('duplicate checking normalizes case and whitespace across display and source names', () => {
  assert.equal(storeNameConflict(stores, '  SCALE   STORY sg ', 'New Source'), true);
  assert.equal(storeNameConflict(stores, 'New Store', ' scale story sg BY ctg4u '), true);
  assert.equal(storeNameConflict(stores, 'New Store', 'New Source'), false);
  assert.equal(storeNameConflict(stores, 'Scale Story Singapore', 'New Source'), true);
  assert.equal(storeNameConflict(stores, 'Scale Story SG', 'Scale Story SG', 'shopee-scale-story-sg'), false);
  assert.equal(storeNameConflict(stores, 'Other Source', 'Other Source', 'shopee-scale-story-sg'), true);
});

test('generated ID collisions are caught before insertion', () => {
  assert.equal(proposedStoreId('ABC'), 'shopee-abc');
  assert.equal(storeIdConflict(stores, proposedStoreId('ABC')), true);
  assert.equal(storeIdConflict(stores, proposedStoreId('Different Store')), false);
});

test('non-Latin store names receive a stable ID', () => {
  const id = proposedStoreId('食补官方店');
  assert.match(id, /^shopee-store-[a-f0-9]{16}$/);
  assert.equal(id, proposedStoreId(' 食补官方店 '));
});
