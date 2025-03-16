import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { FlashLend } from "../target/types/flash_lend";
import {
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  createMint,
  getAccount,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountInstruction,
  unpackAccount,
  createMintToInstruction,
} from "@solana/spl-token";
import { assert } from "chai";
import * as fs from "fs";

describe("flash_lend", () => {
  const keypair = anchor.web3.Keypair.fromSecretKey(
    new Uint8Array(JSON.parse(fs.readFileSync("/home/techsteck/.config/solana/id.json", "utf8")))
  );
  const wallet = new anchor.Wallet(keypair);

  const provider = new anchor.AnchorProvider(
    new anchor.web3.Connection("https://api.testnet.sonic.game"),
    wallet,
    { commitment: "finalized" }
  );
  anchor.setProvider(provider);

  const program = anchor.workspace.FlashLend as Program<FlashLend>;

  let mint: PublicKey;
  let userTokenAccount: PublicKey;
  let poolVault: PublicKey;
  let statePDA: PublicKey;
  let stateBump: number;

  const waitForConfirmation = async (pubkey: PublicKey, retries = 10, delayMs = 2000) => {
    for (let i = 0; i < retries; i++) {
      const accountInfo = await provider.connection.getAccountInfo(pubkey, "finalized");
      if (accountInfo) return;
      console.log(`Waiting for ${pubkey.toBase58()} to be confirmed... (${i + 1}/${retries})`);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
    throw new Error(`Account ${pubkey.toBase58()} not found after retries`);
  };

  const resetPool = async () => {
    await program.methods
      .resetPool()
      .accounts({
        state: statePDA,
        poolVault,
        userTokenAccount,
        payer: wallet.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();
  };

  const stakeToPool = async (stakeAmount = 500_000_000) => {
    await program.methods
      .stakeToPool(new anchor.BN(stakeAmount))
      .accounts({
        state: statePDA,
        poolVault,
        userTokenAccount,
        payer: wallet.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();
  };

  before(async () => {
    console.log("Cluster URL:", provider.connection.rpcEndpoint);
    console.log("Program ID:", program.programId.toBase58());

    [statePDA, stateBump] = PublicKey.findProgramAddressSync(
      [Buffer.from("state")],
      program.programId
    );
    console.log("State PDA:", statePDA.toBase58());

    const balance = await provider.connection.getBalance(wallet.publicKey);
    console.log(`Wallet balance: ${balance / LAMPORTS_PER_SOL} SOL`);

    console.log("Checking state account...");
    const stateAccount = await program.account.flashLendState.fetchNullable(statePDA);
    if (!stateAccount) {
      console.log("Initializing pool...");
      const tx = await program.methods
        .initializePool()
        .accounts({
          state: statePDA,
          payer: wallet.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      console.log("Pool initialized, tx:", tx);
      await waitForConfirmation(statePDA);
    } else {
      console.log("Pool already initialized, skipping initialization");
    }

    console.log("Creating mint...");
    mint = await createMint(
      provider.connection,
      wallet.payer,
      wallet.publicKey,
      null,
      6
    );
    console.log("Mint created:", mint.toBase58());
    await waitForConfirmation(mint);

    const expectedUserAta = getAssociatedTokenAddressSync(
      mint,
      wallet.publicKey,
      false,
      TOKEN_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID
    );
    console.log("Expected user ATA:", expectedUserAta.toBase58());

    console.log("Creating user token account...");
    try {
      const userAccountInfo = await provider.connection.getAccountInfo(expectedUserAta);
      if (!userAccountInfo) {
        console.log("User ATA does not exist, creating it...");
        const tx = new anchor.web3.Transaction().add(
          createAssociatedTokenAccountInstruction(
            wallet.publicKey,
            expectedUserAta,
            wallet.publicKey,
            mint,
            TOKEN_PROGRAM_ID,
            ASSOCIATED_TOKEN_PROGRAM_ID
          )
        );
        const txSig = await provider.sendAndConfirm(tx, [wallet.payer]);
        console.log("User ATA creation tx:", txSig);
        await waitForConfirmation(expectedUserAta);
      }
      userTokenAccount = expectedUserAta;
      console.log("User token account created:", userTokenAccount.toBase58());
    } catch (err) {
      console.error("Failed to create user token account:", err);
      throw err;
    }

    const expectedVaultAta = getAssociatedTokenAddressSync(
      mint,
      statePDA,
      true,
      TOKEN_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID
    );
    console.log("Expected pool vault ATA:", expectedVaultAta.toBase58());

    console.log("Creating pool vault...");
    try {
      const vaultAccountInfo = await provider.connection.getAccountInfo(expectedVaultAta);
      if (!vaultAccountInfo) {
        console.log("Pool vault ATA does not exist, creating it...");
        const tx = new anchor.web3.Transaction().add(
          createAssociatedTokenAccountInstruction(
            wallet.publicKey,
            expectedVaultAta,
            statePDA,
            mint,
            TOKEN_PROGRAM_ID,
            ASSOCIATED_TOKEN_PROGRAM_ID
          )
        );
        const txSig = await provider.sendAndConfirm(tx, [wallet.payer]);
        console.log("Pool vault ATA creation tx:", txSig);
        await waitForConfirmation(expectedVaultAta);
      }
      poolVault = expectedVaultAta;
      console.log("Pool vault created:", poolVault.toBase58());
    } catch (err) {
      console.error("Failed to create pool vault:", err);
      throw err;
    }

    console.log("Minting tokens...");
    try {
      console.log("Verifying mint account...");
      const mintInfo = await provider.connection.getAccountInfo(mint, "finalized");
      if (!mintInfo) throw new Error("Mint account not found on-chain");
      console.log("Mint account confirmed");

      console.log("Verifying user ATA before minting...");
      const userAtaInfo = await provider.connection.getAccountInfo(userTokenAccount, "finalized");
      if (!userAtaInfo) throw new Error("User ATA not found on-chain before minting");
      const userAtaData = unpackAccount(userTokenAccount, userAtaInfo);
      console.log("User ATA data before minting:", {
        mint: userAtaData.mint.toBase58(),
        owner: userAtaData.owner.toBase58(),
        amount: userAtaData.amount.toString(),
      });

      console.log("Minting 10B tokens manually...");
      const mintToTx = new anchor.web3.Transaction().add(
        createMintToInstruction(
          mint,
          userTokenAccount,
          wallet.publicKey,
          10_000_000_000,
          [],
          TOKEN_PROGRAM_ID
        )
      );
      const mintTxSig = await provider.sendAndConfirm(mintToTx, [wallet.payer]);
      console.log("Mint transaction:", mintTxSig);
      await waitForConfirmation(userTokenAccount);

      const userAtaAfter = await getAccount(provider.connection, userTokenAccount);
      console.log("User ATA after minting:", Number(userAtaAfter.amount));
    } catch (err) {
      console.error("Failed to mint tokens:", err);
      throw err;
    }
    console.log("Tokens minted");
  });

  it("Initializes the pool correctly", async () => {
    await resetPool(); // Only reset, no staking
    const state = await program.account.flashLendState.fetch(statePDA);
    assert.equal(state.pool.totalStaked.toNumber(), 0);
    assert.equal(state.pool.available.toNumber(), 0);
    assert.equal(state.pool.accumulatedFees.toNumber(), 0);
    assert.equal(state.activeLoans.length, 0);
    assert.equal(state.reputations.length, 0);
    assert.equal(state.admin.toBase58(), wallet.publicKey.toBase58());
  });

  describe("Stake to Pool", () => {
    beforeEach(async () => await resetPool()); // Reset pool, no initial stake

    it("Stakes tokens successfully", async () => {
      const stakeAmount = 500_000_000;
      const userBalanceBefore = Number((await getAccount(provider.connection, userTokenAccount)).amount);
      await stakeToPool(stakeAmount);

      const state = await program.account.flashLendState.fetch(statePDA);
      const userBalanceAfter = Number((await getAccount(provider.connection, userTokenAccount)).amount);
      const vaultBalance = Number((await getAccount(provider.connection, poolVault)).amount);

      console.log(`Stake result: totalStaked=${state.pool.totalStaked}, available=${state.pool.available}, vault=${vaultBalance}, userBefore=${userBalanceBefore}, userAfter=${userBalanceAfter}`);
      assert.equal(state.pool.totalStaked.toNumber(), stakeAmount);
      assert.equal(state.pool.available.toNumber(), stakeAmount);
      assert.equal(vaultBalance, stakeAmount);
      assert.equal(userBalanceAfter, userBalanceBefore - stakeAmount);
    });

    it("Fails if stake amount is zero", async () => {
      try {
        await stakeToPool(0);
        assert.fail("Should have failed with zero stake amount");
      } catch (err) {
        assert.include(err.toString(), "InvalidAmount");
      }
    });
  });

  describe("Withdraw Stake", () => {
    beforeEach(async () => {
      await resetPool();
      await stakeToPool();
    });

    it("Withdraws stake with fees successfully", async () => {
      const userBalanceBeforeLoan = Number((await getAccount(provider.connection, userTokenAccount)).amount);
      console.log(`User balance before loan: ${userBalanceBeforeLoan}`);

      await program.methods
        .requestLoan(new anchor.BN(100_000_000), new anchor.BN(60))
        .accounts({
          state: statePDA,
          poolVault,
          userTokenAccount,
          payer: wallet.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .rpc();

      const userBalanceAfterLoan = Number((await getAccount(provider.connection, userTokenAccount)).amount);
      console.log(`User balance after loan: ${userBalanceAfterLoan}`);

      await program.methods
        .repayLoan()
        .accounts({
          state: statePDA,
          poolVault,
          userTokenAccount,
          payer: wallet.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .rpc();

      const stateBefore = await program.account.flashLendState.fetch(statePDA);
      const vaultBefore = await getAccount(provider.connection, poolVault);
      const userBalanceBeforeWithdraw = Number((await getAccount(provider.connection, userTokenAccount)).amount);
      console.log(`Before withdraw: total_staked=${stateBefore.pool.totalStaked}, available=${stateBefore.pool.available}, fees=${stateBefore.pool.accumulatedFees}, vault=${vaultBefore.amount}, user=${userBalanceBeforeWithdraw}`);

      const feeBefore = stateBefore.pool.accumulatedFees.toNumber();
      assert.equal(feeBefore, 1_000_000);

      const withdrawAmount = 500_000_000;
      await program.methods
        .withdrawStake(new anchor.BN(withdrawAmount))
        .accounts({
          state: statePDA,
          poolVault,
          userTokenAccount,
          payer: wallet.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .rpc();

      const stateAfter = await program.account.flashLendState.fetch(statePDA);
      const vaultAfter = await getAccount(provider.connection, poolVault);
      const userBalanceAfter = Number((await getAccount(provider.connection, userTokenAccount)).amount);
      console.log(`After withdraw: total_staked=${stateAfter.pool.totalStaked}, available=${stateAfter.pool.available}, fees=${stateAfter.pool.accumulatedFees}, vault=${vaultAfter.amount}, user=${userBalanceAfter}`);

      assert.equal(stateAfter.pool.totalStaked.toNumber(), 0);
      assert.equal(stateAfter.pool.available.toNumber(), 0);
      assert.equal(stateAfter.pool.accumulatedFees.toNumber(), 0);
      assert.equal(Number(vaultAfter.amount), 0);
      assert.equal(userBalanceAfter, userBalanceBeforeWithdraw + withdrawAmount + feeBefore);
    });

    it("Fails if insufficient funds", async () => {
      try {
        await program.methods
          .withdrawStake(new anchor.BN(600_000_000))
          .accounts({
            state: statePDA,
            poolVault,
            userTokenAccount,
            payer: wallet.publicKey,
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .rpc();
        assert.fail("Should have failed with insufficient funds");
      } catch (err) {
        assert.include(err.toString(), "InsufficientFunds");
      }
    });
  });

  describe("Request Loan", () => {
    beforeEach(async () => {
      await resetPool();
      await stakeToPool();
    });

    it("Requests a loan successfully (1% fee)", async () => {
      const stateBefore = await program.account.flashLendState.fetch(statePDA);
      console.log(`Before loan: available=${stateBefore.pool.available.toNumber()}`);

      const loanAmount = 100_000_000;
      const duration = 60;
      const userBalanceBefore = Number((await getAccount(provider.connection, userTokenAccount)).amount);
      const tx = await program.methods
        .requestLoan(new anchor.BN(loanAmount), new anchor.BN(duration))
        .accounts({
          state: statePDA,
          poolVault,
          userTokenAccount,
          payer: wallet.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .rpc();
      console.log("Loan request tx:", tx);

      const state = await program.account.flashLendState.fetch(statePDA);
      const userBalanceAfter = Number((await getAccount(provider.connection, userTokenAccount)).amount);
      console.log(`After loan: available=${state.pool.available.toNumber()}, userBefore=${userBalanceBefore}, userAfter=${userBalanceAfter}`);
      console.log("active_loans length:", state.activeLoans.length);
      console.log("First loan:", JSON.stringify(state.activeLoans[0]));

      assert.equal(state.pool.available.toNumber(), 400_000_000);
      assert.equal(userBalanceAfter, userBalanceBefore + loanAmount);
      assert.equal(state.activeLoans.length, 1);

      const loan = state.activeLoans[0];
      assert.ok(loan, "Loan should exist");
      assert.equal(loan.amount.toNumber(), loanAmount);
      assert.equal(loan.duration.toNumber(), duration);
      assert.equal(loan.fee.toNumber(), 1_000_000);
      assert.equal(loan.repaid, false);
      assert.equal(loan.borrower.toBase58(), wallet.publicKey.toBase58());
    });

    it("Requests a loan with reduced fee (0.5%) after 5 repayments", async () => {
      for (let i = 0; i < 5; i++) {
        await program.methods
          .requestLoan(new anchor.BN(100_000_000), new anchor.BN(60))
          .accounts({
            state: statePDA,
            poolVault,
            userTokenAccount,
            payer: wallet.publicKey,
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .rpc();
        const stateAfterLoan = await program.account.flashLendState.fetch(statePDA);
        console.log(`Loan ${i + 1} created, active_loans length: ${stateAfterLoan.activeLoans.length}`);
    
        await program.methods
          .repayLoan()
          .accounts({
            state: statePDA,
            poolVault,
            userTokenAccount,
            payer: wallet.publicKey,
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .rpc();
        const state = await program.account.flashLendState.fetch(statePDA);
        const rep = state.reputations.find((r) => r.user.equals(wallet.publicKey));
        console.log(`After repayment ${i + 1}: repayments=${rep?.successfulRepayments.toNumber()}`);
      }
    
      const stateBefore = await program.account.flashLendState.fetch(statePDA);
      const reputation = stateBefore.reputations.find((r) => r.user.equals(wallet.publicKey));
      console.log(`Reputations before final loan: ${reputation?.successfulRepayments.toNumber()}`);
      assert.equal(reputation?.successfulRepayments.toNumber(), 5);
    
      await program.methods
        .requestLoan(new anchor.BN(100_000_000), new anchor.BN(60))
        .accounts({
          state: statePDA,
          poolVault,
          userTokenAccount,
          payer: wallet.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .rpc();
    
      const stateAfter = await program.account.flashLendState.fetch(statePDA);
      const activeLoan = stateAfter.activeLoans.find(loan => !loan.repaid);
      assert.ok(activeLoan, "Final loan should exist and be unrepaid");
      console.log(`Final loan fee: ${activeLoan.fee.toNumber()}`);
      assert.equal(activeLoan.fee.toNumber(), 500_000, "Fee should be 0.5% after 5 repayments");
    });

    it("Fails if amount too low (< 10M)", async () => {
      try {
        await program.methods
          .requestLoan(new anchor.BN(1_000_000), new anchor.BN(60))
          .accounts({
            state: statePDA,
            poolVault,
            userTokenAccount,
            payer: wallet.publicKey,
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .rpc();
        assert.fail("Should have failed with low amount");
      } catch (err) {
        assert.include(err.toString(), "InvalidAmount");
      }
    });

    it("Fails if amount too high (> 1T)", async () => {
      try {
        await program.methods
          .requestLoan(new anchor.BN(2_000_000_000_000), new anchor.BN(60))
          .accounts({
            state: statePDA,
            poolVault,
            userTokenAccount,
            payer: wallet.publicKey,
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .rpc();
        assert.fail("Should have failed with high amount");
      } catch (err) {
        assert.include(err.toString(), "InvalidAmount");
      }
    });

    it("Fails if duration too short (< 10s)", async () => {
      try {
        await program.methods
          .requestLoan(new anchor.BN(100_000_000), new anchor.BN(5))
          .accounts({
            state: statePDA,
            poolVault,
            userTokenAccount,
            payer: wallet.publicKey,
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .rpc();
        assert.fail("Should have failed with short duration");
      } catch (err) {
        assert.include(err.toString(), "InvalidDuration");
      }
    });

    it("Fails if duration too long (> 1hr)", async () => {
      try {
        await program.methods
          .requestLoan(new anchor.BN(100_000_000), new anchor.BN(3601))
          .accounts({
            state: statePDA,
            poolVault,
            userTokenAccount,
            payer: wallet.publicKey,
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .rpc();
        assert.fail("Should have failed with long duration");
      } catch (err) {
        assert.include(err.toString(), "InvalidDuration");
      }
    });

    it("Fails if insufficient funds", async () => {
      try {
        await program.methods
          .requestLoan(new anchor.BN(600_000_000), new anchor.BN(60))
          .accounts({
            state: statePDA,
            poolVault,
            userTokenAccount,
            payer: wallet.publicKey,
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .rpc();
        assert.fail("Should have failed with insufficient funds");
      } catch (err) {
        assert.include(err.toString(), "InsufficientFunds");
      }
    });
  });

  describe("Repay Loan", () => {
    beforeEach(async () => {
      await resetPool();
      await stakeToPool();
      await program.methods
        .requestLoan(new anchor.BN(100_000_000), new anchor.BN(60))
        .accounts({
          state: statePDA,
          poolVault,
          userTokenAccount,
          payer: wallet.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .rpc();
    });

    it("Repays a loan successfully", async () => {
      const stateBefore = await program.account.flashLendState.fetch(statePDA);
      console.log(`Before repay: loans=${stateBefore.activeLoans.length}, loan=${JSON.stringify(stateBefore.activeLoans[0])}`);
      const loanBefore = stateBefore.activeLoans[0];
      assert.ok(loanBefore, "Loan should exist before repayment");
      const totalRepayment = loanBefore.amount.add(loanBefore.fee).toNumber();
      const userBalanceBefore = Number((await getAccount(provider.connection, userTokenAccount)).amount);

      await program.methods
        .repayLoan()
        .accounts({
          state: statePDA,
          poolVault,
          userTokenAccount,
          payer: wallet.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .rpc();

      const stateAfter = await program.account.flashLendState.fetch(statePDA);
      const loanAfter = stateAfter.activeLoans[0];
      const userBalanceAfter = Number((await getAccount(provider.connection, userTokenAccount)).amount);
      console.log(`After repay: repaid=${loanAfter.repaid}, available=${stateAfter.pool.available}, fees=${stateAfter.pool.accumulatedFees}`);

      assert.equal(loanAfter.repaid, true);
      assert.equal(stateAfter.pool.available.toNumber(), 500_000_000);
      assert.equal(stateAfter.pool.accumulatedFees.toNumber(), 1_000_000);
      assert.equal(userBalanceAfter, userBalanceBefore - totalRepayment);

      const reputation = stateAfter.reputations.find((r) => r.user.equals(wallet.publicKey));
      assert.equal(reputation?.successfulRepayments.toNumber(), 1);
    });

    it("Fails if no active loan", async () => {
      await program.methods.repayLoan().accounts({
        state: statePDA,
        poolVault,
        userTokenAccount,
        payer: wallet.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
      }).rpc();

      try {
        await program.methods.repayLoan().accounts({
          state: statePDA,
          poolVault,
          userTokenAccount,
          payer: wallet.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
        }).rpc();
        assert.fail("Should have failed with no active loan");
      } catch (err) {
        assert.include(err.toString(), "NoActiveLoan");
      }
    });

    it("Fails if loan expired", async () => {
      await resetPool();
      await stakeToPool();
      await program.methods
        .requestLoan(new anchor.BN(100_000_000), new anchor.BN(10))
        .accounts({
          state: statePDA,
          poolVault,
          userTokenAccount,
          payer: wallet.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .rpc();

      await new Promise((resolve) => setTimeout(resolve, 20000));

      try {
        await program.methods
          .repayLoan()
          .accounts({
            state: statePDA,
            poolVault,
            userTokenAccount,
            payer: wallet.publicKey,
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .rpc();
        assert.fail("Should have failed with expired loan");
      } catch (err) {
        assert.include(err.toString(), "LoanExpired");
      }
    });
  });

  describe("Clean Expired Loans", () => {
    beforeEach(async () => {
      await resetPool();
      await stakeToPool();
      await program.methods
        .requestLoan(new anchor.BN(100_000_000), new anchor.BN(10))
        .accounts({
          state: statePDA,
          poolVault,
          userTokenAccount,
          payer: wallet.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .rpc();
    });

    it("Cleans expired loans successfully", async () => {
      const stateBefore = await program.account.flashLendState.fetch(statePDA);
      const loanBefore = stateBefore.activeLoans[0];
      console.log(`Before clean: loans=${stateBefore.activeLoans.length}, start_time=${loanBefore.startTime}, duration=${loanBefore.duration}`);
      await new Promise((resolve) => setTimeout(resolve, 20000));
      await program.methods.cleanExpiredLoans().accounts({ state: statePDA }).rpc();

      const state = await program.account.flashLendState.fetch(statePDA);
      console.log(`After clean: loans=${state.activeLoans.length}`);
      assert.equal(state.activeLoans.length, 0);
    });
  });

  describe("Reset Pool", () => {
    beforeEach(async () => {
      await resetPool();
      await stakeToPool();
    });

    it("Resets pool successfully (admin)", async () => {
      const initialUserBalance = Number((await getAccount(provider.connection, userTokenAccount)).amount);
      console.log(`Initial user balance after stake: ${initialUserBalance}`);
      const userBalanceBefore = Number((await getAccount(provider.connection, userTokenAccount)).amount);
      const vaultBalanceBefore = Number((await getAccount(provider.connection, poolVault)).amount);
      console.log(`Vault before reset: ${vaultBalanceBefore}, userBefore=${userBalanceBefore}`);

      await program.methods
        .resetPool()
        .accounts({
          state: statePDA,
          poolVault,
          userTokenAccount,
          payer: wallet.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .rpc();

      const state = await program.account.flashLendState.fetch(statePDA);
      const userBalanceAfter = Number((await getAccount(provider.connection, userTokenAccount)).amount);
      const vaultBalance = Number((await getAccount(provider.connection, poolVault)).amount);
      console.log(`Vault after reset: ${vaultBalance}, userAfter=${userBalanceAfter}`);

      assert.equal(state.pool.totalStaked.toNumber(), 0);
      assert.equal(state.pool.available.toNumber(), 0);
      assert.equal(state.pool.accumulatedFees.toNumber(), 0);
      assert.equal(state.activeLoans.length, 0);
      assert.equal(state.reputations.length, 0);
      assert.equal(vaultBalance, 0);
      assert.equal(userBalanceAfter, userBalanceBefore + 500_000_000);
    });
  });
});