use crate::constants::*;
use crate::errors::Error;
use crate::state::*;
use anchor_lang::prelude::*;
use anchor_lang::system_program;
use anchor_spl::metadata::mpl_token_metadata::types::DataV2;
use anchor_spl::{
    associated_token::AssociatedToken,
    metadata::{create_metadata_accounts_v3, CreateMetadataAccountsV3, Metadata as Metaplex},
    token::{Mint, Token, TokenAccount},
};

#[derive(Accounts)]
pub struct Create<'info> {
    #[account(has_one = fee_recipient @ Error::FeeRecipientMismatch)]
    pub config: Account<'info, Config>,

    #[account(init, payer = payer, space = Coin::LEN,
        seeds = [
            COIN_SEED.as_bytes(),
            coin_mint.key().as_ref()
        ],
        bump
    )]
    pub coin: Account<'info, Coin>,
    #[account(init, payer = payer,
        mint::authority = coin,
        mint::decimals = DECIMALS,
    )]
    pub coin_mint: Box<Account<'info, Mint>>,
    #[account(init, payer = payer,
        associated_token::mint = coin_mint,
        associated_token::authority = coin,
    )]
    pub coin_vault: Box<Account<'info, TokenAccount>>,
    /// CHECK: Should be checked by the handler
    #[account(mut)]
    pub sol_vault: UncheckedAccount<'info>,
    /// CHECK: This account is initialized by Metaplex.
    #[account(mut)]
    pub token_metadata: UncheckedAccount<'info>,
    /// CHECK: This account is only used to receive the fee.
    #[account(mut)]
    pub fee_recipient: UncheckedAccount<'info>,

    #[account(mut)]
    pub payer: Signer<'info>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub metaplex_program: Program<'info, Metaplex>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct CreateArgs {
    pub name: String,
    pub symbol: String,
    pub uri: String,
}

pub fn handler<'a, 'b, 'c, 'info>(
    ctx: Context<'a, 'b, 'c, 'info, Create<'info>>,
    args: CreateArgs,
) -> Result<()> {
    require!(
        Coin::check_symbol(args.symbol.as_str()),
        Error::InvalidSymbol
    );

    // 1. Transfer the fee to the fee recipient.
    transfer_create_coin_fee(&ctx)?;

    // 2. Initialize the coin state.
    ctx.accounts.coin.initialize(
        &ctx.accounts.config,
        &ctx.accounts.coin_mint,
        &ctx.accounts.coin_vault,
        args.symbol.clone(),
        ctx.bumps.coin,
    );

    // 3. Create the SOL vault.
    ctx.accounts.coin.create_sol_vault(
        &ctx.accounts.payer,
        &ctx.accounts.sol_vault,
        &ctx.program_id,
        &ctx.accounts.system_program,
        &ctx.accounts.rent,
    )?;

    // 4. Create the metadata account.
    create_metadata_account(&ctx, args)?;

    // 5. Mint the initial supply to the vault.
    let coin_account = ctx.accounts.coin.to_account_info().clone();
    ctx.accounts.coin.initialize_mint(
        &coin_account,
        &ctx.accounts.coin_mint,
        &ctx.accounts.coin_vault,
        &ctx.accounts.token_program,
    )
}

fn transfer_create_coin_fee(ctx: &Context<Create>) -> Result<()> {
    system_program::transfer(
        CpiContext::new(
            ctx.accounts.system_program.to_account_info(),
            system_program::Transfer {
                from: ctx.accounts.payer.to_account_info(),
                to: ctx.accounts.fee_recipient.to_account_info(),
            },
        ),
        ctx.accounts.config.create_coin_fee,
    )
}

fn create_metadata_account(ctx: &Context<Create>, args: CreateArgs) -> Result<()> {
    create_metadata_accounts_v3(
        CpiContext::new(
            ctx.accounts.metaplex_program.to_account_info(),
            CreateMetadataAccountsV3 {
                metadata: ctx.accounts.token_metadata.to_account_info(),
                mint: ctx.accounts.coin_mint.to_account_info(),
                mint_authority: ctx.accounts.coin.to_account_info(),
                payer: ctx.accounts.payer.to_account_info(),
                update_authority: ctx.accounts.coin.to_account_info(),
                system_program: ctx.accounts.system_program.to_account_info(),
                rent: ctx.accounts.rent.to_account_info(),
            },
        )
        .with_signer(&[&ctx.accounts.coin.coin_vault_seeds()]),
        DataV2 {
            name: args.name,
            symbol: args.symbol,
            uri: args.uri,
            seller_fee_basis_points: 0,
            creators: None,
            collection: None,
            uses: None,
        },
        false,
        false,
        None,
    )
}
