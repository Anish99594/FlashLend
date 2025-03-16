import React, { useState } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { Transaction, TransactionInstruction, PublicKey } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync } from '@solana/spl-token';
import { sha256 } from 'js-sha256';
import '../styles/Components.css';

const Stake = ({ mintAddress, statePDA, poolVault, onSuccess }) => {
  const { connection } = useConnection();
  const { publicKey, sendTransaction } = useWallet();
  const [amount, setAmount] = useState('');
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleStake = async () => {
    if (!publicKey) {
      setError('Please connect your wallet.');
      return;
    }
    if (!amount || amount <= 0) {
      setError('Please enter a valid stake amount.');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      setSuccess(null);

      const userTokenAccount = getAssociatedTokenAddressSync(new PublicKey(mintAddress), publicKey);
      const amountBN = BigInt(Math.floor(amount * 1_000_000)); // 6 decimals
      const discriminant = Buffer.from(sha256.digest('global:stake_to_pool')).slice(0, 8);
      const amountBuffer = Buffer.from(new Uint8Array(new BigUint64Array([amountBN]).buffer));
      const data = Buffer.concat([discriminant, amountBuffer]);

      const transaction = new Transaction().add(
        new TransactionInstruction({
          programId: new PublicKey('7niFkVN9AF2vUnHemUyFAzikAfB2LYmKQvreTFiwKRQ8'),
          keys: [
            { pubkey: statePDA, isSigner: false, isWritable: true }, // state
            { pubkey: poolVault, isSigner: false, isWritable: true }, // pool_vault
            { pubkey: userTokenAccount, isSigner: false, isWritable: true }, // user_token_account
            { pubkey: publicKey, isSigner: true, isWritable: false }, // payer
            { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false }, // token_program
          ],
          data,
        })
      );

      const signature = await sendTransaction(transaction, connection);
      await connection.confirmTransaction(signature, 'confirmed');
      setSuccess('Your tokens have been staked successfully!');
      setAmount('');
      onSuccess();
    } catch (err) {
      setError(`Stake failed: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="component-container">
      <h3 className="component-title">Stake Tokens</h3>
      <p className="component-description">Stake your tokens to earn fees from the lending pool</p>
      
      <div className="input-group">
        <label htmlFor="stake-amount">Amount to stake</label>
        <input
          id="stake-amount"
          type="number"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="Enter amount"
          className="input-field"
          disabled={loading}
        />
      </div>
      
      <button 
        onClick={handleStake} 
        className="action-button" 
        disabled={loading}
      >
        {loading ? 'Processing...' : 'Stake Tokens'}
      </button>
      
      {error && <p className="error-message">{error}</p>}
      {success && <p className="success-message">{success}</p>}
    </div>
  );
};

export default Stake;