import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const {assertScratch,digest,expiredEphemeral}=createRequire(import.meta.url)('../scripts/restore-check.cjs');
test('restore drill cannot target the production database, another project or an arbitrary resource',()=>{
  for(const id of ['(default)','sofra-art','sofra-restore-check','sofra-restore-check-20261111-../../default','sofra-restore-check-20261111-deadbeef/extra'])assert.throws(()=>assertScratch('sofra-512816',id),/UNSAFE_RESTORE_TARGET/);
  assert.throws(()=>assertScratch('other','sofra-restore-check-20261111-deadbeef'),/UNSAFE_RESTORE_TARGET/);
  assert.equal(assertScratch('sofra-512816','sofra-restore-check-20261111-deadbeef'),'projects/sofra-512816/databases/sofra-restore-check-20261111-deadbeef');
});
test('restore comparison only normalizes provably expired ephemeral data, never persistent or unknown records',()=>{
  const fields={expiresAt:{timestampValue:'2026-11-10T00:00:00Z'}},cutoff=Date.parse('2026-11-11T00:00:00Z');
  assert.equal(expiredEphemeral('requestLimits',fields,cutoff),true);
  for(const collection of ['comments','assets','siteContent','unknown'])assert.equal(expiredEphemeral(collection,fields,cutoff),false);
  for(const value of [{},{expiresAt:{timestampValue:'invalid'}},{expiresAt:{timestampValue:'2026-11-12T00:00:00Z'}}])assert.equal(expiredEphemeral('requestLimits',value,cutoff),false);
});
test('restore comparison ignores JSON field ordering but detects data changes and sequence differences',()=>{
  assert.equal(digest({a:1,b:{x:true,y:'söz'}}),digest({b:{y:'söz',x:true},a:1}));
  assert.notEqual(digest({a:1}),digest({a:2}));assert.notEqual(digest([1,2]),digest([2,1]));
});
