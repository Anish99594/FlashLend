import React, { useState } from 'react';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { PublicKey, Transaction, TransactionInstruction } from '@solana/web3.js';
import { getAssociatedTokenAddressSync, createAssociatedTokenAccountInstruction } from '@solana/spl-token';
import { Buffer } from 'buffer';
import { sha256 } from 'js-sha256';
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
  ];

  const requestLoan = async () => {
    if (!publicKey) {
      setError('Please connect your wallet.');
      return;
    }
    if (!amount || parseFloat(amount) < 10 || parseFloat(amount) > 100) {
      setError('Loan amount must be between 10 and 100 tokens.');
      return;
    }
  
    try {
      setLoading(true);
      setError(null);
      setSuccess(null);
  
      const userTokenAccount = getAssociatedTokenAddressSync(new PublicKey(mintAddress), publicKey);
      const accountInfo = await connection.getAccountInfo(userTokenAccount);
      const transaction = new Transaction();
  
      if (!accountInfo) {
        const createATAIx = createAssociatedTokenAccountInstruction(
          publicKey,
          userTokenAccount,
          publicKey,
          new PublicKey(mintAddress)
        );
        transaction.add(createATAIx);
      }
  
      const discriminator = Buffer.from(sha256.digest('global:request_loan')).slice(0, 8);
      const amountBN = BigInt(Math.floor(amount * 1_000_000));
      const durationBN = BigInt(duration);
      const data = Buffer.alloc(24);
      discriminator.copy(data, 0);
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
  
      transaction.add(instruction);
      const signature = await sendTransaction(transaction, connection);
      await connection.confirmTransaction(signature, 'confirmed');
  
      setSuccess('Your loan request was successful! Funds have been transferred to your wallet.');
      setAmount('');
      onSuccess();
    } catch (err) {
      console.error('Loan request failed:', err);
      if (err.logs) {
        console.log('Transaction logs:', err.logs);
      }
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
          onChange={(e) => {
            let value = e.target.value;
            if (!/^\d*\.?\d*$/.test(value)) return; // Prevent invalid input
            if (value && (parseFloat(value) < 10 || parseFloat(value) > 100)) {
              setError('Loan amount must be between 10 and 100 tokens.');
            } else {
              setError(null);
            }
            setAmount(value);
          }}
          placeholder="Enter amount (10 - 100)"
          className="input-field"
          min="10"
          max="100"
          step="0.000001"
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