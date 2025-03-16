import React, { useState, useEffect } from 'react';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { PublicKey } from '@solana/web3.js';
import { getAssociatedTokenAddressSync, getAccount } from '@solana/spl-token';
import Stake from './components/Stake';
import WithdrawStake from './components/WithdrawStake';
import RequestLoan from './components/RequestLoan';
import RepayLoan from './components/RepayLoan';
import ResetPool from './components/ResetPool';
import { fetchStateData } from './utils/fetchStateData';
import './styles/Home.css';

const Home = ({ programId, mintAddress }) => {
  const { publicKey } = useWallet();
  const { connection } = useConnection();
  const [stateData, setStateData] = useState(null);
  const [tokenBalance, setTokenBalance] = useState(0);
  const [solBalance, setSolBalance] = useState(0);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [loading, setLoading] = useState(false);

  const mintPubkey = new PublicKey(mintAddress);
  const statePDA = new PublicKey('85jUQnxoq7oXMAzwgGd5teewqHthsHsFV1Sg9aUs7e5i');
  const poolVault = new PublicKey('GMyeNRefwCdWBq17AY3dncy55zwNhtmbyXbRDZV6eemk');

  const refreshData = async () => {
    if (publicKey) {
      try {
        setLoading(true);
        const data = await fetchStateData(connection);
        setStateData({
          ...data,
          activeLoans: data.activeLoans.filter(loan => !loan.repaid),
        });

        const userTokenAccount = getAssociatedTokenAddressSync(mintPubkey, publicKey);
        try {
          const tokenAccountInfo = await getAccount(connection, userTokenAccount);
          setTokenBalance(Number(tokenAccountInfo.amount));
        } catch (e) {
          console.log('Token account not found or other error:', e);
          setTokenBalance(0);
        }

        const sol = await connection.getBalance(publicKey);
        setSolBalance(sol);
      } catch (err) {
        console.error('Failed to refresh data:', err);
      } finally {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    refreshData();
    
    // Set up interval to refresh data every 30 seconds
    const interval = setInterval(refreshData, 30000);
    
    // Clean up interval on component unmount
    return () => clearInterval(interval);
  }, [publicKey, connection]);

  const renderTabContent = () => {
    switch (activeTab) {
      case 'dashboard':
        return (
          <div className="dashboard-content">
            <div className="stats-container">
              <div className="stat-card">
                <h3>Pool Stats</h3>
                <div className="stat-item">
                  <span>Total Staked:</span>
                  <span>{stateData ? (stateData.pool.totalStaked / 1_000_000).toFixed(6) : '0'} Tokens</span>
                </div>
                <div className="stat-item">
                  <span>Available:</span>
                  <span>{stateData ? (stateData.pool.available / 1_000_000).toFixed(6) : '0'} Tokens</span>
                </div>
                <div className="stat-item">
                  <span>Accumulated Fees:</span>
                  <span>{stateData ? (stateData.pool.accumulatedFees / 1_000_000).toFixed(6) : '0'} Tokens</span>
                </div>
              </div>
              
              <div className="stat-card">
                <h3>Your Stats</h3>
                <div className="stat-item">
                  <span>Token Balance:</span>
                  <span>{(tokenBalance / 1_000_000).toFixed(6)} Tokens</span>
                </div>
                <div className="stat-item">
                  <span>SOL Balance:</span>
                  <span>{(solBalance / 1_000_000_000).toFixed(4)} SOL</span>
                </div>
                <div className="stat-item">
                  <span>Active Loans:</span>
                  <span>{stateData?.activeLoans.length || 0}</span>
                </div>
                <div className="stat-item">
                  <span>Reputation Score:</span>
                  <span>{stateData?.reputations.find(r => r?.user.toBase58() === publicKey?.toBase58())?.successfulRepayments || 0}</span>
                </div>
              </div>
            </div>
            
            {stateData?.activeLoans.length > 0 && (
              <div className="active-loans-section">
                <h3>Your Active Loans</h3>
                <div className="loans-table">
                  <div className="table-header">
                    <div>Amount</div>
                    <div>Due Date</div>
                    <div>Status</div>
                  </div>
                  {stateData.activeLoans.map((loan, index) => {
                    const now = new Date().getTime() / 1000;
                    const dueDate = new Date((loan.timestamp.toNumber() + loan.duration.toNumber()) * 1000);
                    const isOverdue = now > (loan.timestamp.toNumber() + loan.duration.toNumber());
                    
                    return (
                      <div key={index} className={`table-row ${isOverdue ? 'overdue' : ''}`}>
                        <div>{(loan.amount / 1_000_000).toFixed(2)} Tokens</div>
                        <div>{dueDate.toLocaleDateString()} {dueDate.toLocaleTimeString()}</div>
                        <div className={`loan-status ${isOverdue ? 'overdue' : 'active'}`}>
                          {isOverdue ? 'Overdue' : 'Active'}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        );
      case 'stake':
        return (
          <div className="tab-content">
            <div className="action-cards">
              <div className="action-card">
                <Stake 
                  mintAddress={mintAddress} 
                  statePDA={statePDA} 
                  poolVault={poolVault} 
                  onSuccess={refreshData} 
                />
              </div>
              <div className="action-card">
                <WithdrawStake 
                  mintAddress={mintAddress} 
                  statePDA={statePDA} 
                  poolVault={poolVault} 
                  onSuccess={refreshData} 
                />
              </div>
            </div>
          </div>
        );
      case 'borrow':
        return (
          <div className="tab-content">
            <div className="action-cards">
              <div className="action-card">
                <RequestLoan 
                  mintAddress={mintAddress} 
                  statePDA={statePDA} 
                  poolVault={poolVault} 
                  onSuccess={refreshData} 
                />
              </div>
              <div className="action-card">
                <RepayLoan 
                  mintAddress={mintAddress} 
                  statePDA={statePDA} 
                  poolVault={poolVault} 
                  onSuccess={refreshData} 
                />
              </div>
            </div>
          </div>
        );
      case 'admin':
        return (
          <div className="tab-content">
            <div className="action-cards">
              <div className="action-card admin-card">
                <ResetPool 
                  mintAddress={mintAddress} 
                  statePDA={statePDA} 
                  poolVault={poolVault} 
                  onSuccess={refreshData} 
                />
              </div>
            </div>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="home-container">
      <header className="app-header">
        <div className="logo-container">
          <div className="logo">
            <span className="logo-icon">💸</span>
            <h1>Flash Lending</h1>
          </div>
          <p className="tagline">Instant liquidity on Solana</p>
        </div>
        <div className="wallet-container">
          <WalletMultiButton className="wallet-button" />
          {publicKey && (
            <div className="wallet-address">
              {`${publicKey.toBase58().slice(0, 4)}...${publicKey.toBase58().slice(-4)}`}
            </div>
          )}
        </div>
      </header>

      <main className="main-content">
        {!publicKey ? (
          <div className="connect-prompt">
            <div className="connect-card">
              <h2>Welcome to Flash Lending</h2>
              <p>Connect your wallet to start staking, borrowing, and earning.</p>
              <WalletMultiButton className="connect-button" />
            </div>
          </div>
        ) : (
          <>
            <nav className="app-nav">
              <ul className="nav-tabs">
                <li 
                  className={activeTab === 'dashboard' ? 'active' : ''}
                  onClick={() => setActiveTab('dashboard')}
                >
                  Dashboard
                </li>
                <li 
                  className={activeTab === 'stake' ? 'active' : ''}
                  onClick={() => setActiveTab('stake')}
                >
                  Stake
                </li>
                <li 
                  className={activeTab === 'borrow' ? 'active' : ''}
                  onClick={() => setActiveTab('borrow')}
                >
                  Borrow
                </li>
                <li 
                  className={activeTab === 'admin' ? 'active' : ''}
                  onClick={() => setActiveTab('admin')}
                >
                  Admin
                </li>
              </ul>
              <button onClick={refreshData} className="refresh-button">
                {loading ? 'Loading...' : 'Refresh'}
              </button>
            </nav>
            
            {renderTabContent()}
          </>
        )}
      </main>
      
      <footer className="app-footer">
        <p>© 2025 Flash Lending | Powered by Solana</p>
      </footer>
    </div>
  );
};

export default Home;