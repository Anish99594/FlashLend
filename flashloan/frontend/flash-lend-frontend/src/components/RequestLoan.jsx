import React, { useState } from 'react';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { PublicKey, Transaction, TransactionInstruction } from '@solana/web3.js';
import { getAssociatedTokenAddressSync } from '@solana/spl-token';
import { Buffer } from 'buffer';
import '../styles/Components.css';

// Ensure Buffer is available
window.Buffer = window.Buffer || Buffer;

const PROGRAM_ID = new PublicKey('7niFkVN9AF2vUnHemUyFAzikAfB2LYmKQvreTFiwKRQ8');
const TOKEN_PROGRAM = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');

const RequestLoan = ({ mintAddress, statePDA, poolVault, onSuccess }) => {
  const { publicKey, sendTransaction } = useWallet();
  const { connection } = useConnection();
  const [amount, setAmount] = useState('');
  const [duration, setDuration] = useState('60'); // Default to 60 seconds
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [loading, setLoading] = useState(false);

  const durationOptions = [
    { value: '60', label: '1 minute' },
    { value: '300', label: '5 minutes' },
    { value: '900', label: '15 minutes' },
    { value: '3600', label: '1 hour' },
    { value: '86400', label: '1 day' }
  ];

  const requestLoan = async () => {
    if (!publicKey) {
      setError('Please connect your wallet.');
      return;
    }
    if (!amount || !duration) {
      setError('Please enter a valid amount and duration.');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      setSuccess(null);

      const userTokenAccount = getAssociatedTokenAddressSync(new PublicKey(mintAddress), publicKey);

      const discriminator = Buffer.from([120, 2, 7, 7, 1, 219, 235, 187]);
      const amountBN = BigInt(Math.floor(amount * 1_000_000)); // Convert to lamports (6 decimals)
      const durationBN = BigInt(duration);
      const data = Buffer.alloc(24);
      data.writeUInt32LE(discriminator.readUInt32LE(0), 0);
      data.writeUInt32LE(discriminator.readUInt32LE(4), 4);
      data.writeBigUInt64LE(amountBN, 8);
      data.writeBigUInt64LE(durationBN, 16);

      const instruction = new TransactionInstruction({
        keys: [
          { pubkey: statePDA, isSigner: false, isWritable: true },
          { pubkey: poolVault, isSigner: false, isWritable: true },
          { pubkey: userTokenAccount, isSigner: false, isWritable: true },
          { pubkey: publicKey, isSigner: true, isWritable: true },
          { pubkey: TOKEN_PROGRAM, isSigner: false, isWritable: false },
        ],
        programId: PROGRAM_ID,
        data,
      });

      const transaction = new Transaction().add(instruction);
      const signature = await sendTransaction(transaction, connection);
      await connection.confirmTransaction(signature, 'confirmed');
      
      setSuccess('Your loan request was successful! Funds have been transferred to your wallet.');
      setAmount('');
      onSuccess();
    } catch (err) {
      console.error('Loan request failed:', err);
      setError(`Loan request failed: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="component-container">
      <h3 className="component-title">Request Flash Loan</h3>
      <p className="component-description">Borrow tokens instantly with flash loans</p>
      
      <div className="input-group">
        <label htmlFor="loan-amount">Loan amount</label>
        <input
          id="loan-amount"
          type="number"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="Enter amount"
          className="input-field"
          disabled={loading}
        />
      </div>
      
      <div className="input-group">
        <label htmlFor="loan-duration">Loan duration</label>
        <select
          id="loan-duration"
          value={duration}
          onChange={(e) => setDuration(e.target.value)}
          className="input-field"
          disabled={loading}
        >
          {durationOptions.map(option => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
      
      <div className="loan-info">
        <div className="info-item">
          <span>Fee:</span>
          <span>{amount ? (Number(amount) * 0.01).toFixed(6) : '0'} Tokens (1%)</span>
        </div>
        <div className="info-item">
          <span>Repayment Amount:</span>
          <span>{amount ? (Number(amount) * 1.01).toFixed(6) : '0'} Tokens</span>
        </div>
      </div>

      <button 
        onClick={requestLoan} 
        className="action-button" 
        disabled={loading}
      >
        {loading ? 'Processing...' : 'Request Loan'}
      </button>
      
      {error && <p className="error-message">{error}</p>}
      {success && <p className="success-message">{success}</p>}
    </div>
  );
};

export default RequestLoan;