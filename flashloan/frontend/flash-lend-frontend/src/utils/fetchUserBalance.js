// src/utils/fetchUserBalance.js
import { getAccount } from '@solana/spl-token';

const fetchUserBalance = async (connection, userTokenAccount) => {
  try {
    const accountInfo = await getAccount(connection, userTokenAccount);
    return Number(accountInfo.amount);
  } catch (err) {
    return 0;
  }
};

export default fetchUserBalance;