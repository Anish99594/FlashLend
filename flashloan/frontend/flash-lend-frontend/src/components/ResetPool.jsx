import React, { useState } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { Transaction, TransactionInstruction, PublicKey } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync } from '@solana/spl-token';
import { sha256 } from 'js-sha256';
import '../styles/Components.css';

const ResetPool = ({ mintAddress, statePDA, poolVault, onSuccess }) => {
  const { connection } = useConnection();
  const { publicKey, sendTransaction } = useWallet();
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [loading, setLoading] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  const handleReset = async () => {
    if (!publicKey) {
      setError('Please connect your wallet.');
      return;
    }

    if (!confirmReset) {
      setConfirmReset(true);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      setSuccess(null);

      const userTokenAccount = getAssociatedTokenAddressSync(new PublicKey(mintAddress), publicKey);
      const discriminant = Buffer.from(sha256.digest('global:reset_pool')).slice(0, 8);
      const data = discriminant; // No additional args

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
      
      setSuccess('Pool reset successful!');
      setConfirmReset(false);
      onSuccess();
    } catch (err) {
      setError(`Reset failed: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const cancelReset = () => {
    setConfirmReset(false);
    setError(null);
  };

  return (
    <div className="component-container admin-container">
      <h3 className="component-title">Reset Pool (Admin Only)</h3>
      <p className="component-description">Reset the pool state (warning: this is a destructive action)</p>
      
      {!confirmReset ? (
        <button 
          onClick={handleReset} 
          className="action-button caution-button"
          disabled={loading}
        >
          Reset Pool
        </button>
      ) : (
        <div className="confirmation-container">
          <p className="confirmation-message">Are you sure you want to reset the pool? This cannot be undone.</p>
          <div className="confirmation-buttons">
            <button 
              onClick={handleReset} 
              className="action-button confirm-button"
              disabled={loading}
            >
              {loading ? 'Processing...' : 'Yes, Reset Pool'}
            </button>
            <button 
              onClick={cancelReset} 
              className="action-button cancel-button"
              disabled={loading}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
      
      {error && <p className="error-message">{error}</p>}
      {success && <p className="success-message">{success}</p>}
    </div>
  );
};

export default ResetPool;