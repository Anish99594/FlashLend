import React, { useState, useEffect } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { Transaction, TransactionInstruction, PublicKey } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync } from '@solana/spl-token';
import { sha256 } from 'js-sha256';
import { fetchStateData } from '../utils/fetchStateData';
import '../styles/Components.css';

const RepayLoan = ({ mintAddress, statePDA, poolVault, onSuccess }) => {
  const { connection } = useConnection();
  const { publicKey, sendTransaction } = useWallet();
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [loading, setLoading] = useState(false);
  const [activeLoans, setActiveLoans] = useState([]);
  const [tokenBalance, setTokenBalance] = useState(0);

  useEffect(() => {
    const fetchData = async () => {
      if (publicKey) {
        try {
          const data = await fetchStateData(connection);
          const loans = data.activeLoans.filter(loan => 
            !loan.repaid && loan.borrower.toBase58() === publicKey.toBase58()
          );
          setActiveLoans(loans);
          
          const userTokenAccount = getAssociatedTokenAddressSync(new PublicKey(mintAddress), publicKey);
          try {
            const tokenAccountInfo = await getAccount(connection, userTokenAccount);
            setTokenBalance(Number(tokenAccountInfo.amount) / 1_000_000);
          } catch (e) {
            console.log('Token account not found or other error:', e);
            setTokenBalance(0);
          }
        } catch (err) {
          console.error('Failed to fetch loan data:', err);
        }
      }
    };
    
    fetchData();
  }, [publicKey, connection, mintAddress]);

  const handleRepayLoan = async () => {
    if (!publicKey) {
      setError('Please connect your wallet.');
      return;
    }
    
    if (activeLoans.length === 0) {
      setError('You have no active loans to repay.');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      setSuccess(null);

      const userTokenAccount = getAssociatedTokenAddressSync(new PublicKey(mintAddress), publicKey);
      const discriminant = Buffer.from(sha256.digest('global:repay_loan')).slice(0, 8);
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
      setSuccess('Loan repayment successful! Your reputation score has increased.');
      onSuccess();
    } catch (err) {
      setError(`Repayment failed: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Calculate total repayment amount needed
  const totalRepaymentNeeded = activeLoans.reduce((sum, loan) => {
    return sum + (Number(loan.amount) * 1.01); // Principal + 1% fee
  }, 0) / 1_000_000; // Convert to user-facing amount

  return (
    <div className="component-container">
      <h3 className="component-title">Repay Loan</h3>
      <p className="component-description">Repay your outstanding flash loans</p>
      
      {activeLoans.length > 0 ? (
        <div className="loan-summary">
          <h4>Active Loans Summary</h4>
          <div className="summary-items">
            <div className="summary-item">
              <span>Number of loans:</span>
              <span>{activeLoans.length}</span></div>
            <div className="summary-item">
              <span>Total to repay:</span>
              <span>{totalRepaymentNeeded.toFixed(6)} Tokens</span>
            </div>
            <div className="summary-item">
              <span>Your balance:</span>
              <span className={tokenBalance < totalRepaymentNeeded ? 'insufficient' : ''}>{tokenBalance.toFixed(6)} Tokens</span>
            </div>
          </div>
          
          {tokenBalance < totalRepaymentNeeded && (
            <p className="balance-warning">Warning: You don't have enough tokens to repay your loans!</p>
          )}
        </div>
      ) : (
        <p className="empty-state">You have no active loans to repay</p>
      )}
      
      <button 
        onClick={handleRepayLoan} 
        className={`action-button ${activeLoans.length === 0 ? 'disabled' : ''}`}
        disabled={loading || activeLoans.length === 0}
      >
        {loading ? 'Processing...' : 'Repay All Loans'}
      </button>
      
      {error && <p className="error-message">{error}</p>}
      {success && <p className="success-message">{success}</p>}
    </div>
  );
};

export default RepayLoan;