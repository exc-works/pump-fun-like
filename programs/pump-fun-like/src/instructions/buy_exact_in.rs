use crate::errors::Error;
use crate::state::*;
use anchor_lang::prelude::*;
use anchor_spl::token::{Token, TokenAccount};

#[derive(Accounts)]
pub struct BuyExactIn<'info> {
    #[account(has_one = fee_recipient @ Error::FeeRecipientMismatch)]
    pub config: Box<Account<'info, Config>>,
    #[account(mut,
        has_one = config @ Error::ConfigAccountMismatch,
        has_one = coin_vault @ Error::CoinVaultMismatch,
        has_one = sol_vault @ Error::SolVaultAccountMismatch,
    )]
    pub coin: Box<Account<'info, Coin>>,
    #[account(mut,
        constraint = coin_recipient.mint == coin.coin_mint.key() @ Error::CoinMintAccountMismatch
    )]
    pub coin_recipient: Box<Account<'info, TokenAccount>>,
    /// CHECK: This account is only used to receive the fee.
    #[account(mut)]
    pub fee_recipient: UncheckedAccount<'info>,
    #[account(mut)]
    pub coin_vault: Box<Account<'info, TokenAccount>>,
    /// CHECK: This account is only used to receive the sol.
    #[account(mut)]
    pub sol_vault: UncheckedAccount<'info>,
    #[account(mut)]
    pub payer: Signer<'info>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct BuyExactInArgs {
    /// Amount of SOL to pay, not including the fee.
    pub pay_amount: u64,
    /// Minimum amount of coin to receive.
    pub min_receive: u64,
}

pub fn handler(ctx: Context<BuyExactIn>, args: BuyExactInArgs) -> Result<()> {
    let coin_copy = ctx.accounts.coin.clone();
    ctx.accounts.coin.buy_exact_in(
        &ctx.accounts.config,
        &coin_copy.to_account_info(),
        &ctx.accounts.coin_vault,
        &ctx.accounts.sol_vault,
        &ctx.accounts.fee_recipient,
        &ctx.accounts.coin_recipient,
        &ctx.accounts.payer,
        &ctx.accounts.token_program,
        &ctx.accounts.system_program,
        args.pay_amount,
        args.min_receive,
    )
}
