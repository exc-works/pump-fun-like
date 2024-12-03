use anchor_lang::prelude::*;

use crate::constants::FEE_RATE_BASIS_POINT;
use crate::errors::Error;

#[account]
pub struct Config {
    pub authority: Pubkey,
    pub fee_recipient: Pubkey,
    pub migration_authority: Pubkey,
    pub create_coin_fee: u64,
    pub taker_fee_rate: u32,
    pub maker_fee_rate: u32,
}

impl Config {
    pub const LEN: usize = 8 + std::mem::size_of::<Config>();

    pub fn initialize(
        &mut self,
        authority: Pubkey,
        fee_recipient: Pubkey,
        migration_authority: Pubkey,
    ) {
        self.authority = authority;
        self.fee_recipient = fee_recipient;
        self.migration_authority = migration_authority;
    }

    pub fn update_fee(
        &mut self,
        create_coin_fee: u64,
        taker_fee_rate: u32,
        maker_fee_rate: u32,
    ) -> Result<()> {
        require!(
            taker_fee_rate <= FEE_RATE_BASIS_POINT,
            Error::InvalidTakerFeeRate
        );
        require!(
            maker_fee_rate <= FEE_RATE_BASIS_POINT,
            Error::InvalidMakerFeeRate
        );

        self.create_coin_fee = create_coin_fee;
        self.taker_fee_rate = taker_fee_rate;
        self.maker_fee_rate = maker_fee_rate;
        Ok(())
    }
}
