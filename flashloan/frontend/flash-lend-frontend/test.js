// test.js
import { Program } from '@coral-xyz/anchor';
// Node 23.9.0 needs experimental flag or dynamic import for JSON
const idl = await import('./src/idl/flash_lend.json', { with: { type: 'json' } });

try {
  console.log('Loaded IDL accounts:', JSON.stringify(idl.default.accounts, null, 2));
  const program = new Program(idl.default, '7niFkVN9AF2vUnHemUyFAzikAfB2LYmKQvreTFiwKRQ8');
  console.log('Program loaded:', program.programId.toString());
  console.log('Accounts:', Object.keys(program.account));
  console.log('FlashLendState:', program.account.flashLendState);
  console.log('Size:', program.account.flashLendState.size);
} catch (err) {
  console.error('Error:', err);
  console.trace(err);
}