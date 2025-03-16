import React from 'react';
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import { PhantomWalletAdapter } from '@solana/wallet-adapter-wallets';
import { useMemo } from 'react';
import Home from './Home.jsx';
import '@solana/wallet-adapter-react-ui/styles.css';
import './App.css';

const programId = '7niFkVN9AF2vUnHemUyFAzikAfB2LYmKQvreTFiwKRQ8';
const mintAddress = 'B58NRmQPGRdu1WM5He8LdGxVDDv22N3kdXg8peTG1Ujd';

const App = () => {
  const network = 'devnet';
  const endpoint = useMemo(() => 'https://api.testnet.sonic.game', [network]);
  const wallets = useMemo(() => [new PhantomWalletAdapter()], []);

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>
          <div className="app-container">
            <Home programId={programId} mintAddress={mintAddress} />
          </div>
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
};

export default App;