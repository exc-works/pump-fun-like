use crate::errors::Error;
use anchor_lang::prelude::*;
use anchor_spl::token::{Token, TokenAccount};

use crate::{Coin, Config};

#[derive(Accounts)]
pub struct SellExactOut<'info> {
    #[account(has_one = fee_recipient @ Error::FeeRecipientMismatch)]
    pub config: Box<Account<'info, Config>>,
    #[account(mut,
        has_one = config @ Error::ConfigAccountMismatch,
        has_one = coin_vault @ Error::CoinVaultMismatch,
        has_one = sol_vault @ Error::SolVaultAccountMismatch,
    )]
    pub coin: Box<Account<'info, Coin>>,
    /// CHECK: This account is only used to receive the fee.
    #[account(mut)]
    pub fee_recipient: UncheckedAccount<'info>,
    #[account(mut)]
    pub coin_vault: Box<Account<'info, TokenAccount>>,
    /// CHECK: This account is only used to receive the sol.
    pub sol_vault: UncheckedAccount<'info>,
    /// CHECK: This account is only used to receive the sol.
    #[account(mut)]
    pub sol_recipient: UncheckedAccount<'info>,
    #[account(mut,
        token::mint = coin.coin_mint,
        token::authority = payer,
    )]
    pub coin_payer: Box<Account<'info, TokenAccount>>,
    #[account(mut)]
    pub payer: Signer<'info>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct SellExactOutArgs {
    /// Amount of sol to receive.
    pub receive: u64,
    /// Maximum amount of coin to sell.
    pub max_pay: u64,
}

pub fn handler(ctx: Context<SellExactOut>, args: SellExactOutArgs) -> Result<()> {
    ctx.accounts.coin.sell_exact_out(
        &ctx.accounts.config,
        &ctx.accounts.coin_vault,
        &ctx.accounts.sol_vault,
        &ctx.accounts.fee_recipient,
        &ctx.accounts.sol_recipient,
        &ctx.accounts.coin_payer,
        &ctx.accounts.payer,
        &ctx.accounts.token_program,
        &ctx.accounts.system_program,
        args.receive,
        args.max_pay,
    )
}
