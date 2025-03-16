// src/utils/fetchStateData.js
import { PublicKey } from "@solana/web3.js";
import * as borsh from "@project-serum/borsh";

const PROGRAM_ID = new PublicKey("7niFkVN9AF2vUnHemUyFAzikAfB2LYmKQvreTFiwKRQ8");
const STATE_PDA = new PublicKey("85jUQnxoq7oXMAzwgGd5teewqHthsHsFV1Sg9aUs7e5i");

const flashLendStateSchema = borsh.struct([
  borsh.publicKey("admin"),
  borsh.struct(
    [
      borsh.u64("totalStaked"),
      borsh.u64("available"),
      borsh.u64("accumulatedFees"),
    ],
    "pool"
  ),
  borsh.vec(
    borsh.option(
      borsh.struct([
        borsh.publicKey("borrower"),
        borsh.u64("amount"),
        borsh.u64("fee"),
        borsh.u64("duration"),
        borsh.u64("startTime"),
        borsh.bool("repaid"),
      ])
    ),
    "activeLoans"
  ),
  borsh.vec(
    borsh.option(
      borsh.struct([borsh.publicKey("user"), borsh.u64("successfulRepayments")])
    ),
    "reputations"
  ),
]);

export async function fetchStateData(connection) {
  const accountInfo = await connection.getAccountInfo(STATE_PDA);
  if (!accountInfo) throw new Error("State account not found");

  const data = accountInfo.data;
  const decoded = flashLendStateSchema.decode(data.slice(8));
  
  console.log("Raw total_staked:", decoded.pool.totalStaked.toString());
  console.log("Raw available:", decoded.pool.available.toString());
  console.log("Raw accumulated_fees:", decoded.pool.accumulatedFees.toString());
  console.log("Raw active_loans (pre-filter):", JSON.stringify(decoded.activeLoans, null, 2));
  
  const activeLoans = decoded.activeLoans
    .map(loan =>
      loan ? {
        borrower: loan.borrower.toBase58(),
        amount: Number(loan.amount),
        fee: Number(loan.fee),
        duration: Number(loan.duration),
        startTime: Number(loan.startTime),
        repaid: loan.repaid,
      } : null
    )
    .filter(Boolean);
  
  console.log("Filtered active_loans:", JSON.stringify(activeLoans, null, 2));
  console.log("Active loans count (all):", activeLoans.length);
  console.log("Active loans count (unrepaid):", activeLoans.filter(loan => !loan.repaid).length);

  return {
    admin: decoded.admin,
    pool: {
      totalStaked: Number(decoded.pool.totalStaked),
      available: Number(decoded.pool.available),
      accumulatedFees: Number(decoded.pool.accumulatedFees),
    },
    activeLoans: activeLoans,
    reputations: decoded.reputations
      .map(rep =>
        rep ? {
          user: rep.user,
          successfulRepayments: Number(rep.successfulRepayments),
        } : null
      )
      .filter(Boolean),
  };
}