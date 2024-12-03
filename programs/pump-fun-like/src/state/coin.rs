use crate::constants::{
    COIN_SEED, FEE_RATE_BASIS_POINT, MAX_COIN_SUPPLY, REVERSE_COINS, SOL_VAULT_SEED,
    SYMBOL_MAX_LEN, SYMBOL_MIN_LEN,
};
use crate::errors::Error;
use crate::math::{coin_math, fee_math, sol_math};
use crate::state::*;
use anchor_lang::prelude::*;
use anchor_lang::system_program;
use anchor_spl::token::{self, Mint, Token, TokenAccount};

#[account]
pub struct Coin {
    pub config: Pubkey,     // 32
    pub coin_mint: Pubkey,  // 32
    pub coin_vault: Pubkey, // 32
    pub sol_vault: Pubkey,  // 32
    /// Remaining coin supply on the bounding curve.
    pub remaining_coin_supply: u64, // 8
    /// Accumulates the amount of sol on the bounding curve.
    pub accumulate_sol: u64, // 8
    pub symbol: String,     // 4 + 10
    pub coin_bump: [u8; 1], // 1
    pub sol_vault_bump: [u8; 1], // 1
}

impl Coin {
    pub const LEN: usize = 8 + 32 * 4 + 8 * 2 + 4 + 10 + 1 * 2 + 24; // 24 is reversed

    pub fn coin_vault_seeds(&self) -> [&[u8]; 3] {
        [
            COIN_SEED.as_bytes(),
            self.coin_mint.as_ref(),
            self.coin_bump.as_ref(),
        ]
    }

    pub fn sol_vault_seeds(&self) -> [&[u8]; 3] {
        [
            SOL_VAULT_SEED.as_bytes(),
            self.coin_mint.as_ref(),
            self.sol_vault_bump.as_ref(),
        ]
    }

    pub fn initialize<'info>(
        &mut self,
        config: &Account<'info, Config>,
        coin_mint: &Account<'info, Mint>,
        coin_vault: &Account<'info, TokenAccount>,
        symbol: String,
        coin_bump: u8,
    ) {
        self.config = config.key();
        self.coin_mint = coin_mint.key();
        self.coin_vault = coin_vault.key();
        self.symbol = symbol;
        self.coin_bump = [coin_bump];
    }

    pub fn create_sol_vault<'info>(
        &mut self,
        payer: &Signer<'info>,
        sol_vault: &UncheckedAccount<'info>,
        program_id: &Pubkey,
        system_program: &Program<'info, System>,
        rent: &Sysvar<'info, Rent>,
    ) -> Result<()> {
        let (sol_vault_actual, sol_vault_bump) = Pubkey::find_program_address(
            &[SOL_VAULT_SEED.as_bytes(), self.coin_mint.as_ref()],
            program_id,
        );
        require!(
            sol_vault_actual.as_ref() == sol_vault.key().as_ref(),
            Error::SolVaultAccountMismatch
        );

        self.sol_vault = sol_vault_actual;
        self.sol_vault_bump = [sol_vault_bump];

        system_program::create_account(
            CpiContext::new(
                system_program.to_account_info(),
                system_program::CreateAccount {
                    from: payer.to_account_info(),
                    to: sol_vault.to_account_info(),
                },
            )
            .with_signer(&[&self.sol_vault_seeds()]),
            rent.minimum_balance(0),
            0,
            &system_program.key(),
        )
    }

    /// Mints the maximum supply of the coin to the coin vault.
    pub fn initialize_mint<'info>(
        &mut self,
        coin: &AccountInfo<'info>,
        coin_mint: &Account<'info, Mint>,
        coin_vault: &Account<'info, TokenAccount>,
        token_program: &Program<'info, Token>,
    ) -> Result<()> {
        self.remaining_coin_supply = MAX_COIN_SUPPLY;
        token::mint_to(
            CpiContext::new(
                token_program.to_account_info(),
                token::MintTo {
                    mint: coin_mint.to_account_info(),
                    to: coin_vault.to_account_info(),
                    authority: coin.to_account_info(),
                },
            )
            .with_signer(&[&self.coin_vault_seeds()]),
            MAX_COIN_SUPPLY,
        )
    }

    pub fn buy<'info>(
        &mut self,
        config: &Account<'info, Config>,
        coin: &AccountInfo<'info>,
        coin_vault: &Account<'info, TokenAccount>,
        sol_vault: &UncheckedAccount<'info>,
        fee_recipient: &UncheckedAccount<'info>,
        coin_recipient: &Account<'info, TokenAccount>,
        payer: &Signer<'info>,
        token_program: &Program<'info, Token>,
        system_program: &Program<'info, System>,
        amount: u64,
        max_pay: u64,
    ) -> Result<()> {
        require!(
            self.remaining_coin_supply > REVERSE_COINS,
            Error::AlreadyLaunched
        );
        let available_supply = self.available_supply();
        require!(amount <= available_supply, Error::InsufficientSupply);

        let pay_amount = coin_math::buy(self.remaining_coin_supply, amount);
        let maker_fee = fee_math::buy(pay_amount, config.maker_fee_rate);
        let total_pay: u128 = pay_amount as u128 + maker_fee as u128;
        require!(total_pay <= max_pay as u128, Error::MaxPayExceeded);

        self.remaining_coin_supply -= amount;
        self.accumulate_sol += pay_amount;

        self.buy_transfer(
            coin,
            coin_vault,
            sol_vault,
            fee_recipient,
            coin_recipient,
            payer,
            token_program,
            system_program,
            pay_amount,
            maker_fee,
            amount,
        )
    }

    pub fn buy_exact_in<'info>(
        &mut self,
        config: &Account<'info, Config>,
        coin: &AccountInfo<'info>,
        coin_vault: &Account<'info, TokenAccount>,
        sol_vault: &UncheckedAccount<'info>,
        fee_recipient: &UncheckedAccount<'info>,
        coin_recipient: &Account<'info, TokenAccount>,
        payer: &Signer<'info>,
        token_program: &Program<'info, Token>,
        system_program: &Program<'info, System>,
        pay_amount: u64,
        min_receive: u64,
    ) -> Result<()> {
        require!(
            self.remaining_coin_supply > REVERSE_COINS,
            Error::AlreadyLaunched
        );
        let maker_fee = fee_math::buy(pay_amount, config.maker_fee_rate);
        let actual_receive = sol_math::buy(self.remaining_coin_supply, pay_amount);
        require!(actual_receive >= min_receive, Error::InsufficientReceive);

        self.remaining_coin_supply -= actual_receive;
        self.accumulate_sol += pay_amount;

        self.buy_transfer(
            coin,
            coin_vault,
            sol_vault,
            fee_recipient,
            coin_recipient,
            payer,
            token_program,
            system_program,
            pay_amount,
            maker_fee,
            actual_receive,
        )
    }

    pub fn sell<'info>(
        &mut self,
        config: &Account<'info, Config>,
        coin_vault: &Account<'info, TokenAccount>,
        sol_vault: &UncheckedAccount<'info>,
        fee_recipient: &UncheckedAccount<'info>,
        sol_recipient: &UncheckedAccount<'info>,
        coin_payer: &Account<'info, TokenAccount>,
        payer: &Signer<'info>,
        token_program: &Program<'info, Token>,
        system_program: &Program<'info, System>,
        amount: u64,
        min_receive: u64,
    ) -> Result<()> {
        require!(
            self.remaining_coin_supply > REVERSE_COINS,
            Error::AlreadyLaunched
        );
        let receive_with_fee = coin_math::sell(self.remaining_coin_supply, amount);
        let taker_fee = fee_math::sell(receive_with_fee, config.taker_fee_rate);
        let receive_without_fee = receive_with_fee - taker_fee;
        require!(
            receive_without_fee >= min_receive,
            Error::InsufficientReceive
        );

        self.remaining_coin_supply += amount;
        self.accumulate_sol -= receive_with_fee;

        self.sell_transfer(
            coin_vault,
            sol_vault,
            fee_recipient,
            sol_recipient,
            coin_payer,
            payer,
            token_program,
            system_program,
            receive_without_fee,
            taker_fee,
            amount,
        )
    }

    pub fn sell_exact_out<'info>(
        &mut self,
        config: &Account<'info, Config>,
        coin_vault: &Account<'info, TokenAccount>,
        sol_vault: &UncheckedAccount<'info>,
        fee_recipient: &UncheckedAccount<'info>,
        sol_recipient: &UncheckedAccount<'info>,
        coin_payer: &Account<'info, TokenAccount>,
        payer: &Signer<'info>,
        token_program: &Program<'info, Token>,
        system_program: &Program<'info, System>,
        receive: u64,
        max_pay: u64,
    ) -> Result<()> {
        require!(
            self.remaining_coin_supply > REVERSE_COINS,
            Error::AlreadyLaunched
        );
        require!(receive > 0, Error::InvalidReceive);
        // total_receive = receive / (1 - taker_fee_rate)
        let total_receive = receive as u128 * FEE_RATE_BASIS_POINT as u128
            / (FEE_RATE_BASIS_POINT as u128 - config.taker_fee_rate as u128);
        let taker_fee = total_receive - receive as u128;
        require!(
            total_receive <= self.accumulate_sol as u128,
            Error::InsufficientReceive
        );

        let actual_pay = sol_math::sell(self.remaining_coin_supply, total_receive as u64)?;
        require!(actual_pay <= max_pay, Error::MaxPayExceeded);

        self.remaining_coin_supply += actual_pay;
        self.accumulate_sol -= total_receive as u64;

        self.sell_transfer(
            coin_vault,
            sol_vault,
            fee_recipient,
            sol_recipient,
            coin_payer,
            payer,
            token_program,
            system_program,
            receive,
            taker_fee as u64,
            actual_pay,
        )
    }

    /// Returns the available supply of the coin.
    pub fn available_supply(&self) -> u64 {
        self.remaining_coin_supply - REVERSE_COINS
    }

    pub fn check_symbol(symbol: &str) -> bool {
        symbol.len() >= SYMBOL_MIN_LEN && symbol.len() <= SYMBOL_MAX_LEN
    }

    fn buy_transfer<'info>(
        &self,
        coin: &AccountInfo<'info>,
        coin_vault: &Account<'info, TokenAccount>,
        sol_vault: &UncheckedAccount<'info>,
        fee_recipient: &UncheckedAccount<'info>,
        coin_recipient: &Account<'info, TokenAccount>,
        payer: &Signer<'info>,
        token_program: &Program<'info, Token>,
        system_program: &Program<'info, System>,
        pay_amount_without_fee: u64,
        maker_fee: u64,
        coin_amount: u64,
    ) -> Result<()> {
        // 1. transfer sol to sol vault
        system_program::transfer(
            CpiContext::new(
                system_program.to_account_info(),
                system_program::Transfer {
                    from: payer.to_account_info(),
                    to: sol_vault.to_account_info(),
                },
            ),
            pay_amount_without_fee,
        )?;

        // 2. transfer fee to fee recipient
        system_program::transfer(
            CpiContext::new(
                system_program.to_account_info(),
                system_program::Transfer {
                    from: payer.to_account_info(),
                    to: fee_recipient.to_account_info(),
                },
            ),
            maker_fee,
        )?;

        // 3. transfer coin to coin recipient
        token::transfer(
            CpiContext::new(
                token_program.to_account_info(),
                token::Transfer {
                    from: coin_vault.to_account_info(),
                    to: coin_recipient.to_account_info(),
                    authority: coin.to_account_info(),
                },
            )
            .with_signer(&[&self.coin_vault_seeds()]),
            coin_amount,
        )
    }

    fn sell_transfer<'info>(
        &self,
        coin_vault: &Account<'info, TokenAccount>,
        sol_vault: &UncheckedAccount<'info>,
        fee_recipient: &UncheckedAccount<'info>,
        sol_recipient: &UncheckedAccount<'info>,
        coin_payer: &Account<'info, TokenAccount>,
        payer: &Signer<'info>,
        token_program: &Program<'info, Token>,
        system_program: &Program<'info, System>,
        receive_without_fee: u64,
        taker_fee: u64,
        amount: u64,
    ) -> Result<()> {
        let sol_vault_seeds = self.sol_vault_seeds();
        // 1. transfer sol to sol recipient
        system_program::transfer(
            CpiContext::new(
                system_program.to_account_info(),
                system_program::Transfer {
                    from: sol_vault.to_account_info(),
                    to: sol_recipient.to_account_info(),
                },
            )
            .with_signer(&[&sol_vault_seeds]),
            receive_without_fee,
        )?;

        // 2. transfer fee to fee recipient
        system_program::transfer(
            CpiContext::new(
                system_program.to_account_info(),
                system_program::Transfer {
                    from: sol_vault.to_account_info(),
                    to: fee_recipient.to_account_info(),
                },
            )
            .with_signer(&[&sol_vault_seeds]),
            taker_fee,
        )?;

        // 3. transfer coin to coin vault
        token::transfer(
            CpiContext::new(
                token_program.to_account_info(),
                token::Transfer {
                    from: coin_payer.to_account_info(),
                    to: coin_vault.to_account_info(),
                    authority: payer.to_account_info(),
                },
            ),
            amount,
        )
    }
}
