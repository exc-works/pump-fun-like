use anchor_lang::prelude::*;

use crate::Config;

#[derive(Accounts)]
pub struct InitializeConfig<'info> {
    #[account(init, payer = payer, space = Config::LEN)]
    pub config: Account<'info, Config>,
    #[account(mut)]
    pub payer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct InitializeConfigArgs {
    /// The authority to set on the config.
    pub authority: Pubkey,
    /// The recipient of fees, include trading fees and create coin fees.
    pub fee_recipient: Pubkey,
    /// The authority to migrate the coin to Raydium.
    pub migration_authority: Pubkey,
    /// The fee to create a coin.
    pub create_coin_fee: u64,
    /// The fee rate for taker.
    pub taker_fee_rate: u32,
    /// The fee rate for maker.
    pub maker_fee_rate: u32,
}

pub fn handler(ctx: Context<InitializeConfig>, args: InitializeConfigArgs) -> Result<()> {
    ctx.accounts
        .config
        .initialize(args.authority, args.fee_recipient, args.migration_authority);
    ctx.accounts.config.update_fee(
        args.create_coin_fee,
        args.taker_fee_rate,
        args.maker_fee_rate,
    )
}
