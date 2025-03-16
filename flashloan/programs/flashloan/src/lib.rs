// use anchor_lang::prelude::*;
// use anchor_spl::token::{self, Token, TokenAccount, Transfer};

// declare_id!("7niFkVN9AF2vUnHemUyFAzikAfB2LYmKQvreTFiwKRQ8");

// #[program]
// pub mod flash_lend {
//     use super::*;

//     pub fn initialize_pool(ctx: Context<InitializePool>) -> Result<()> {
//         let state = &mut ctx.accounts.state;
//         state.pool = Pool {
//             total_staked: 0,
//             available: 0,
//             accumulated_fees: 0,
//         };
//         state.active_loans = Vec::new();
//         state.reputations = Vec::new();
//         state.admin = ctx.accounts.payer.key();
//         Ok(())
//     }

//     pub fn stake_to_pool(ctx: Context<StakeToPool>, amount: u64) -> Result<()> {
//         if amount == 0 {
//             return Err(ErrorCode::InvalidAmount.into());
//         }

//         let state = &mut ctx.accounts.state;
//         let cpi_accounts = Transfer {
//             from: ctx.accounts.user_token_account.to_account_info(),
//             to: ctx.accounts.pool_vault.to_account_info(),
//             authority: ctx.accounts.payer.to_account_info(),
//         };
//         let cpi_ctx = CpiContext::new(ctx.accounts.token_program.to_account_info(), cpi_accounts);
//         token::transfer(cpi_ctx, amount)?;

//         state.pool.total_staked = state.pool.total_staked.checked_add(amount).ok_or(ErrorCode::Overflow)?;
//         state.pool.available = state.pool.available.checked_add(amount).ok_or(ErrorCode::Overflow)?;
//         Ok(())
//     }

//     pub fn withdraw_stake(ctx: Context<WithdrawStake>, amount: u64) -> Result<()> {
//         let total_staked = ctx.accounts.state.pool.total_staked;
//         let available = ctx.accounts.state.pool.available;
//         let accumulated_fees = ctx.accounts.state.pool.accumulated_fees;
//         let vault_balance = ctx.accounts.pool_vault.amount;
    
//         if amount > available {
//             return Err(ErrorCode::InsufficientFunds.into());
//         }
    
//         let fee_share = if total_staked > 0 {
//             (amount as u128)
//                 .checked_mul(accumulated_fees as u128)
//                 .ok_or(ErrorCode::Overflow)?
//                 .checked_div(total_staked as u128)
//                 .ok_or(ErrorCode::Overflow)? as u64
//         } else {
//             0
//         };
    
//         let total_withdrawal = amount.checked_add(fee_share).ok_or(ErrorCode::Overflow)?;
    
//         if total_withdrawal > vault_balance {
//             return Err(ErrorCode::InsufficientFunds.into());
//         }
    
//         let cpi_accounts = Transfer {
//             from: ctx.accounts.pool_vault.to_account_info(),
//             to: ctx.accounts.user_token_account.to_account_info(),
//             authority: ctx.accounts.state.to_account_info(),
//         };
//         let seeds = &[b"state".as_ref(), &[ctx.bumps.state]];
//         let signer = &[&seeds[..]];
//         let cpi_ctx = CpiContext::new_with_signer(ctx.accounts.token_program.to_account_info(), cpi_accounts, signer);
//         token::transfer(cpi_ctx, total_withdrawal)?;
    
//         let state = &mut ctx.accounts.state;
//         state.pool.total_staked = state.pool.total_staked.checked_sub(amount).ok_or(ErrorCode::Overflow)?;
//         state.pool.available = state.pool.available.checked_sub(amount).ok_or(ErrorCode::Overflow)?; // Subtract only amount
//         state.pool.accumulated_fees = state.pool.accumulated_fees.checked_sub(fee_share).ok_or(ErrorCode::Overflow)?;
//         Ok(())
//     }

//     pub fn request_loan(ctx: Context<RequestLoan>, amount: u64, duration: u64) -> Result<()> {
//         if amount < 10_000_000 || amount > 1_000_000_000_000 {
//             return Err(ErrorCode::InvalidAmount.into());
//         }
//         if duration < 10 || duration > 3600 {
//             return Err(ErrorCode::InvalidDuration.into());
//         }
//         if amount > ctx.accounts.state.pool.available {
//             return Err(ErrorCode::InsufficientFunds.into());
//         }

//         let state = &mut ctx.accounts.state;
//         let borrower = ctx.accounts.payer.key();
//         let current_time = Clock::get()?.unix_timestamp as u64;

//         let reputation = state.reputations.iter().find(|r| r.as_ref().map_or(false, |rep| rep.user == borrower));
//         let fee_percentage = if let Some(Some(rep)) = reputation {
//             if rep.successful_repayments >= 5 { 50 } else { 100 }
//         } else {
//             100
//         };
//         let fee = (amount as u128)
//             .checked_mul(fee_percentage as u128)
//             .ok_or(ErrorCode::Overflow)?
//             .checked_div(10_000)
//             .ok_or(ErrorCode::Overflow)? as u64;

//         state.active_loans.push(Some(Loan {
//             borrower,
//             amount,
//             fee,
//             duration,
//             start_time: current_time,
//             repaid: false,
//         }));

//         state.pool.available = state.pool.available.checked_sub(amount).ok_or(ErrorCode::Overflow)?;

//         let cpi_accounts = Transfer {
//             from: ctx.accounts.pool_vault.to_account_info(),
//             to: ctx.accounts.user_token_account.to_account_info(),
//             authority: ctx.accounts.state.to_account_info(),
//         };
//         let seeds = &[b"state".as_ref(), &[ctx.bumps.state]];
//         let signer = &[&seeds[..]];
//         let cpi_ctx = CpiContext::new_with_signer(ctx.accounts.token_program.to_account_info(), cpi_accounts, signer);
//         token::transfer(cpi_ctx, amount)?;

//         Ok(())
//     }

//     pub fn repay_loan(ctx: Context<RepayLoan>) -> Result<()> {
//         let state = &mut ctx.accounts.state;
//         let payer_key = ctx.accounts.payer.key();
//         let current_time = Clock::get()?.unix_timestamp as u64;

//         let mut loan_index = None;
//         for (i, loan_opt) in state.active_loans.iter_mut().enumerate() {
//             if let Some(loan) = loan_opt {
//                 if loan.borrower == payer_key && !loan.repaid {
//                     if current_time > loan.start_time + loan.duration {
//                         return Err(ErrorCode::LoanExpired.into());
//                     }
//                     loan_index = Some(i);
//                     break;
//                 }
//             }
//         }

//         let loan_idx = loan_index.ok_or(ErrorCode::NoActiveLoan)?;
//         let total_repayment;
//         let loan_amount;
//         let loan_fee;
//         {
//             let loan = state.active_loans[loan_idx].as_mut().unwrap();
//             total_repayment = loan.amount.checked_add(loan.fee).ok_or(ErrorCode::Overflow)?;
//             loan_amount = loan.amount;
//             loan_fee = loan.fee;
//             loan.repaid = true;
//         }

//         let cpi_accounts = Transfer {
//             from: ctx.accounts.user_token_account.to_account_info(),
//             to: ctx.accounts.pool_vault.to_account_info(),
//             authority: ctx.accounts.payer.to_account_info(),
//         };
//         let cpi_ctx = CpiContext::new(ctx.accounts.token_program.to_account_info(), cpi_accounts);
//         token::transfer(cpi_ctx, total_repayment)?;

//         state.pool.available = state.pool.available.checked_add(loan_amount).ok_or(ErrorCode::Overflow)?; // Only add loan amount
//         state.pool.accumulated_fees = state.pool.accumulated_fees.checked_add(loan_fee).ok_or(ErrorCode::Overflow)?;

//         let reputation = state.reputations.iter_mut().find(|r| r.is_some() && r.as_ref().unwrap().user == payer_key);
//         match reputation {
//             Some(rep_opt) => rep_opt.as_mut().unwrap().successful_repayments += 1,
//             None => state.reputations.push(Some(Reputation {
//                 user: payer_key,
//                 successful_repayments: 1,
//             })),
//         }

//         Ok(())
//     }

//     pub fn reset_pool(ctx: Context<ResetPool>) -> Result<()> {
//         if ctx.accounts.payer.key() != ctx.accounts.state.admin {
//             return Err(ErrorCode::Unauthorized.into());
//         }

//         let vault_balance = ctx.accounts.pool_vault.amount;
//         if vault_balance > 0 {
//             let cpi_accounts = Transfer {
//                 from: ctx.accounts.pool_vault.to_account_info(),
//                 to: ctx.accounts.user_token_account.to_account_info(),
//                 authority: ctx.accounts.state.to_account_info(),
//             };
//             let seeds = &[b"state".as_ref(), &[ctx.bumps.state]];
//             let signer = &[&seeds[..]];
//             let cpi_ctx = CpiContext::new_with_signer(ctx.accounts.token_program.to_account_info(), cpi_accounts, signer);
//             token::transfer(cpi_ctx, vault_balance)?;
//         }

//         let state = &mut ctx.accounts.state;
//         state.pool.total_staked = 0;
//         state.pool.available = 0;
//         state.pool.accumulated_fees = 0;
//         state.active_loans.clear();
//         state.reputations.clear();
//         msg!("Pool reset by admin");
//         Ok(())
//     }

//     pub fn clean_expired_loans(ctx: Context<CleanExpiredLoans>) -> Result<()> {
//         let state = &mut ctx.accounts.state;
//         let current_time = Clock::get()?.unix_timestamp as u64;
//         state.active_loans.retain(|loan_opt| {
//             if let Some(loan) = loan_opt {
//                 !(current_time > loan.start_time + loan.duration && !loan.repaid)
//             } else {
//                 true
//             }
//         });
//         Ok(())
//     }
// }

// #[derive(Accounts)]
// pub struct InitializePool<'info> {
//     #[account(
//         init,
//         payer = payer,
//         space = 8 + 32 + 24 + (4 + 50 * (32 + 8 + 8 + 8 + 8 + 1)) + (4 + 50 * (32 + 8)),
//         seeds = [b"state"],
//         bump
//     )]
//     pub state: Account<'info, FlashLendState>,
//     #[account(mut)]
//     pub payer: Signer<'info>,
//     pub system_program: Program<'info, System>,
// }

// #[derive(Accounts)]
// pub struct StakeToPool<'info> {
//     #[account(mut, seeds = [b"state"], bump)]
//     pub state: Account<'info, FlashLendState>,
//     #[account(mut)]
//     pub pool_vault: Account<'info, TokenAccount>,
//     #[account(mut)]
//     pub user_token_account: Account<'info, TokenAccount>,
//     #[account(mut)]
//     pub payer: Signer<'info>,
//     pub token_program: Program<'info, Token>,
// }

// #[derive(Accounts)]
// pub struct WithdrawStake<'info> {
//     #[account(mut, seeds = [b"state"], bump)]
//     pub state: Account<'info, FlashLendState>,
//     #[account(mut)]
//     pub pool_vault: Account<'info, TokenAccount>,
//     #[account(mut)]
//     pub user_token_account: Account<'info, TokenAccount>,
//     #[account(mut)]
//     pub payer: Signer<'info>,
//     pub token_program: Program<'info, Token>,
// }

// #[derive(Accounts)]
// pub struct RequestLoan<'info> {
//     #[account(mut, seeds = [b"state"], bump)]
//     pub state: Account<'info, FlashLendState>,
//     #[account(mut)]
//     pub pool_vault: Account<'info, TokenAccount>,
//     #[account(mut)]
//     pub user_token_account: Account<'info, TokenAccount>,
//     #[account(mut)]
//     pub payer: Signer<'info>,
//     pub token_program: Program<'info, Token>,
// }

// #[derive(Accounts)]
// pub struct RepayLoan<'info> {
//     #[account(mut, seeds = [b"state"], bump)]
//     pub state: Account<'info, FlashLendState>,
//     #[account(mut)]
//     pub pool_vault: Account<'info, TokenAccount>,
//     #[account(mut)]
//     pub user_token_account: Account<'info, TokenAccount>,
//     #[account(mut)]
//     pub payer: Signer<'info>,
//     pub token_program: Program<'info, Token>,
// }

// #[derive(Accounts)]
// pub struct ResetPool<'info> {
//     #[account(mut, seeds = [b"state"], bump)]
//     pub state: Account<'info, FlashLendState>,
//     #[account(mut)]
//     pub pool_vault: Account<'info, TokenAccount>,
//     #[account(mut)]
//     pub user_token_account: Account<'info, TokenAccount>,
//     #[account(mut)]
//     pub payer: Signer<'info>,
//     pub token_program: Program<'info, Token>,
// }

// #[derive(Accounts)]
// pub struct CleanExpiredLoans<'info> {
//     #[account(mut, seeds = [b"state"], bump)]
//     pub state: Account<'info, FlashLendState>,
// }

// #[account]
// pub struct FlashLendState {
//     pub admin: Pubkey,
//     pub pool: Pool,
//     pub active_loans: Vec<Option<Loan>>,
//     pub reputations: Vec<Option<Reputation>>,
// }

// #[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
// pub struct Pool {
//     pub total_staked: u64,
//     pub available: u64,
//     pub accumulated_fees: u64,
// }

// #[derive(AnchorSerialize, AnchorDeserialize, Clone)]
// pub struct Loan {
//     pub borrower: Pubkey,
//     pub amount: u64,
//     pub fee: u64,
//     pub duration: u64,
//     pub start_time: u64,
//     pub repaid: bool,
// }

// #[derive(AnchorSerialize, AnchorDeserialize, Clone)]
// pub struct Reputation {
//     pub user: Pubkey,
//     pub successful_repayments: u64,
// }

// #[error_code]
// pub enum ErrorCode {
//     #[msg("Invalid amount provided")]
//     InvalidAmount,
//     #[msg("Invalid duration provided")]
//     InvalidDuration,
//     #[msg("Insufficient funds in pool")]
//     InsufficientFunds,
//     #[msg("No active loan found")]
//     NoActiveLoan,
//     #[msg("Loan has expired")]
//     LoanExpired,
//     #[msg("Arithmetic overflow occurred")]
//     Overflow,
//     #[msg("Unauthorized access")]
//     Unauthorized,
// }


use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

declare_id!("7niFkVN9AF2vUnHemUyFAzikAfB2LYmKQvreTFiwKRQ8");

#[program]
pub mod flash_lend {
    use super::*;

    pub fn initialize_pool(ctx: Context<InitializePool>) -> Result<()> {
        let state = &mut ctx.accounts.state;
        state.pool = Pool {
            total_staked: 0,
            available: 0,
            accumulated_fees: 0,
        };
        state.active_loans = Vec::new();
        state.reputations = Vec::new();
        state.admin = ctx.accounts.payer.key();
        msg!("Pool initialized by admin: {}", state.admin);
        Ok(())
    }

    pub fn stake_to_pool(ctx: Context<StakeToPool>, amount: u64) -> Result<()> {
        if amount == 0 {
            return Err(ErrorCode::InvalidAmount.into());
        }

        let state = &mut ctx.accounts.state;
        let cpi_accounts = Transfer {
            from: ctx.accounts.user_token_account.to_account_info(),
            to: ctx.accounts.pool_vault.to_account_info(),
            authority: ctx.accounts.payer.to_account_info(),
        };
        let cpi_ctx = CpiContext::new(ctx.accounts.token_program.to_account_info(), cpi_accounts);
        token::transfer(cpi_ctx, amount)?;

        state.pool.total_staked = state.pool.total_staked.checked_add(amount).ok_or(ErrorCode::Overflow)?;
        state.pool.available = state.pool.available.checked_add(amount).ok_or(ErrorCode::Overflow)?;
        msg!("Staked {} tokens by {}", amount, ctx.accounts.payer.key());
        Ok(())
    }

    pub fn withdraw_stake(ctx: Context<WithdrawStake>, amount: u64) -> Result<()> {
        let state = &mut ctx.accounts.state;
        let total_staked = state.pool.total_staked;
        let available = state.pool.available;
        let accumulated_fees = state.pool.accumulated_fees;
        let vault_balance = ctx.accounts.pool_vault.amount;

        if amount > available {
            return Err(ErrorCode::InsufficientFunds.into());
        }

        let fee_share = if total_staked > 0 {
            (amount as u128)
                .checked_mul(accumulated_fees as u128)
                .ok_or(ErrorCode::Overflow)?
                .checked_div(total_staked as u128)
                .ok_or(ErrorCode::Overflow)? as u64
        } else {
            0
        };

        let total_withdrawal = amount.checked_add(fee_share).ok_or(ErrorCode::Overflow)?;
        if total_withdrawal > vault_balance {
            return Err(ErrorCode::InsufficientFunds.into());
        }

        let cpi_accounts = Transfer {
            from: ctx.accounts.pool_vault.to_account_info(),
            to: ctx.accounts.user_token_account.to_account_info(),
            authority: state.to_account_info(),
        };
        let seeds = &[b"state".as_ref(), &[ctx.bumps.state]];
        let signer = &[&seeds[..]];
        let cpi_ctx = CpiContext::new_with_signer(ctx.accounts.token_program.to_account_info(), cpi_accounts, signer);
        token::transfer(cpi_ctx, total_withdrawal)?;

        state.pool.total_staked = total_staked.checked_sub(amount).ok_or(ErrorCode::Overflow)?;
        state.pool.available = available.checked_sub(amount).ok_or(ErrorCode::Overflow)?;
        state.pool.accumulated_fees = accumulated_fees.checked_sub(fee_share).ok_or(ErrorCode::Overflow)?;
        msg!("Withdrew {} tokens (including {} fee share) by {}", amount, fee_share, ctx.accounts.payer.key());
        Ok(())
    }

    pub fn request_loan(ctx: Context<RequestLoan>, amount: u64, duration: u64) -> Result<()> {
        if amount < 10_000_000 || amount > 1_000_000_000_000 {
            return Err(ErrorCode::InvalidAmount.into());
        }
        if duration < 10 || duration > 3600 {
            return Err(ErrorCode::InvalidDuration.into());
        }
        let state = &mut ctx.accounts.state;
        if amount > state.pool.available {
            return Err(ErrorCode::InsufficientFunds.into());
        }

        let borrower = ctx.accounts.payer.key();
        let current_time = Clock::get()?.unix_timestamp as u64;
        let reputation = state.reputations.iter().find(|r| r.as_ref().map_or(false, |rep| rep.user == borrower));
        let fee_percentage = if let Some(Some(rep)) = reputation {
            if rep.successful_repayments >= 5 { 50 } else { 100 } // 0.5% or 1%
        } else {
            100 // 1%
        };
        let fee = (amount as u128)
            .checked_mul(fee_percentage as u128)
            .ok_or(ErrorCode::Overflow)?
            .checked_div(10_000)
            .ok_or(ErrorCode::Overflow)? as u64;

        state.active_loans.push(Some(Loan {
            borrower,
            amount,
            fee,
            duration,
            start_time: current_time,
            repaid: false,
        }));

        state.pool.available = state.pool.available.checked_sub(amount).ok_or(ErrorCode::Overflow)?;

        let cpi_accounts = Transfer {
            from: ctx.accounts.pool_vault.to_account_info(),
            to: ctx.accounts.user_token_account.to_account_info(),
            authority: state.to_account_info(),
        };
        let seeds = &[b"state".as_ref(), &[ctx.bumps.state]];
        let signer = &[&seeds[..]];
        let cpi_ctx = CpiContext::new_with_signer(ctx.accounts.token_program.to_account_info(), cpi_accounts, signer);
        token::transfer(cpi_ctx, amount)?;

        msg!("Loan requested: {} tokens, fee: {}, duration: {}s by {}", amount, fee, duration, borrower);
        Ok(())
    }

    pub fn repay_loan(ctx: Context<RepayLoan>) -> Result<()> {
        let state = &mut ctx.accounts.state;
        let payer_key = ctx.accounts.payer.key();
        let current_time = Clock::get()?.unix_timestamp as u64;

        let mut loan_index = None;
        for (i, loan_opt) in state.active_loans.iter_mut().enumerate() {
            if let Some(loan) = loan_opt {
                if loan.borrower == payer_key && !loan.repaid {
                    if current_time > loan.start_time + loan.duration {
                        return Err(ErrorCode::LoanExpired.into());
                    }
                    loan_index = Some(i);
                    break;
                }
            }
        }

        let loan_idx = loan_index.ok_or(ErrorCode::NoActiveLoan)?;
        let total_repayment;
        let loan_amount;
        let loan_fee;
        {
            let loan = state.active_loans[loan_idx].as_mut().unwrap(); // Mutably borrow in place
            total_repayment = loan.amount.checked_add(loan.fee).ok_or(ErrorCode::Overflow)?;
            loan_amount = loan.amount;
            loan_fee = loan.fee;
            loan.repaid = true; // Modify directly
        }

        let cpi_accounts = Transfer {
            from: ctx.accounts.user_token_account.to_account_info(),
            to: ctx.accounts.pool_vault.to_account_info(),
            authority: ctx.accounts.payer.to_account_info(),
        };
        let cpi_ctx = CpiContext::new(ctx.accounts.token_program.to_account_info(), cpi_accounts);
        token::transfer(cpi_ctx, total_repayment)?;

        state.pool.available = state.pool.available.checked_add(loan_amount).ok_or(ErrorCode::Overflow)?;
        state.pool.accumulated_fees = state.pool.accumulated_fees.checked_add(loan_fee).ok_or(ErrorCode::Overflow)?;

        let reputation = state.reputations.iter_mut().find(|r| r.is_some() && r.as_ref().unwrap().user == payer_key);
        match reputation {
            Some(rep_opt) => rep_opt.as_mut().unwrap().successful_repayments += 1,
            None => state.reputations.push(Some(Reputation {
                user: payer_key,
                successful_repayments: 1,
            })),
        }

        msg!("Loan repaid: {} tokens (fee: {}) by {}", total_repayment, loan_fee, payer_key);
        Ok(())
    }

    pub fn reset_pool(ctx: Context<ResetPool>) -> Result<()> {
        let state = &mut ctx.accounts.state;
        if ctx.accounts.payer.key() != state.admin {
            return Err(ErrorCode::Unauthorized.into());
        }

        let vault_balance = ctx.accounts.pool_vault.amount;
        if vault_balance > 0 {
            let cpi_accounts = Transfer {
                from: ctx.accounts.pool_vault.to_account_info(),
                to: ctx.accounts.user_token_account.to_account_info(),
                authority: state.to_account_info(),
            };
            let seeds = &[b"state".as_ref(), &[ctx.bumps.state]];
            let signer = &[&seeds[..]];
            let cpi_ctx = CpiContext::new_with_signer(ctx.accounts.token_program.to_account_info(), cpi_accounts, signer);
            token::transfer(cpi_ctx, vault_balance)?;
        }

        state.pool.total_staked = 0;
        state.pool.available = 0;
        state.pool.accumulated_fees = 0;
        state.active_loans.clear();
        state.reputations.clear();
        msg!("Pool reset by admin: {}", ctx.accounts.payer.key());
        Ok(())
    }

    pub fn clean_expired_loans(ctx: Context<CleanExpiredLoans>) -> Result<()> {
        let state = &mut ctx.accounts.state;
        let current_time = Clock::get()?.unix_timestamp as u64;
        let initial_len = state.active_loans.len();
        state.active_loans.retain(|loan_opt| {
            if let Some(loan) = loan_opt {
                !(current_time > loan.start_time + loan.duration && !loan.repaid)
            } else {
                true
            }
        });
        msg!("Cleaned {} expired loans", initial_len - state.active_loans.len());
        Ok(())
    }
}

#[derive(Accounts)]
pub struct InitializePool<'info> {
    #[account(
        init,
        payer = payer,
        space = 8 + 32 + 24 + (4 + 50 * (1 + 32 + 8 + 8 + 8 + 8 + 1)) + (4 + 50 * (1 + 32 + 8)),
        seeds = [b"state"],
        bump
    )]
    pub state: Account<'info, FlashLendState>,
    #[account(mut)]
    pub payer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct StakeToPool<'info> {
    #[account(mut, seeds = [b"state"], bump)]
    pub state: Account<'info, FlashLendState>,
    #[account(mut)]
    pub pool_vault: Account<'info, TokenAccount>,
    #[account(mut)]
    pub user_token_account: Account<'info, TokenAccount>,
    #[account(mut)]
    pub payer: Signer<'info>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct WithdrawStake<'info> {
    #[account(mut, seeds = [b"state"], bump)]
    pub state: Account<'info, FlashLendState>,
    #[account(mut)]
    pub pool_vault: Account<'info, TokenAccount>,
    #[account(mut)]
    pub user_token_account: Account<'info, TokenAccount>,
    #[account(mut)]
    pub payer: Signer<'info>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct RequestLoan<'info> {
    #[account(mut, seeds = [b"state"], bump)]
    pub state: Account<'info, FlashLendState>,
    #[account(mut)]
    pub pool_vault: Account<'info, TokenAccount>,
    #[account(mut)]
    pub user_token_account: Account<'info, TokenAccount>,
    #[account(mut)]
    pub payer: Signer<'info>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct RepayLoan<'info> {
    #[account(mut, seeds = [b"state"], bump)]
    pub state: Account<'info, FlashLendState>,
    #[account(mut)]
    pub pool_vault: Account<'info, TokenAccount>,
    #[account(mut)]
    pub user_token_account: Account<'info, TokenAccount>,
    #[account(mut)]
    pub payer: Signer<'info>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct ResetPool<'info> {
    #[account(mut, seeds = [b"state"], bump)]
    pub state: Account<'info, FlashLendState>,
    #[account(mut)]
    pub pool_vault: Account<'info, TokenAccount>,
    #[account(mut)]
    pub user_token_account: Account<'info, TokenAccount>,
    #[account(mut)]
    pub payer: Signer<'info>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct CleanExpiredLoans<'info> {
    #[account(mut, seeds = [b"state"], bump)]
    pub state: Account<'info, FlashLendState>,
}

#[account]
pub struct FlashLendState {
    pub admin: Pubkey,
    pub pool: Pool,
    pub active_loans: Vec<Option<Loan>>,
    pub reputations: Vec<Option<Reputation>>,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct Pool {
    pub total_staked: u64,
    pub available: u64,
    pub accumulated_fees: u64,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct Loan {
    pub borrower: Pubkey,
    pub amount: u64,
    pub fee: u64,
    pub duration: u64,
    pub start_time: u64,
    pub repaid: bool,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct Reputation {
    pub user: Pubkey,
    pub successful_repayments: u64,
}

#[error_code]
pub enum ErrorCode {
    #[msg("Invalid amount provided")]
    InvalidAmount,
    #[msg("Invalid duration provided")]
    InvalidDuration,
    #[msg("Insufficient funds in pool")]
    InsufficientFunds,
    #[msg("No active loan found")]
    NoActiveLoan,
    #[msg("Loan has expired")]
    LoanExpired,
    #[msg("Arithmetic overflow occurred")]
    Overflow,
    #[msg("Unauthorized access")]
    Unauthorized,
}