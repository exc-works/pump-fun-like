use crate::errors::Error;
use crate::state::Config;
use anchor_lang::prelude::*;

#[derive(Accounts)]
pub struct UpdateFee<'info> {
    #[account(mut, has_one = authority @ Error::AuthorityMismatch)]
    pub config: Account<'info, Config>,
    pub authority: Signer<'info>,
}

#[account]
pub struct UpdateFeeArgs {
    pub create_coin_fee: u64,
    pub taker_fee_rate: u32,
    pub maker_fee_rate: u32,
}

pub fn handler(ctx: Context<UpdateFee>, args: UpdateFeeArgs) -> Result<()> {
    ctx.accounts.config.update_fee(
        args.create_coin_fee,
        args.taker_fee_rate,
        args.maker_fee_rate,
    )
}
