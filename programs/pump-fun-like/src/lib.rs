use anchor_lang::prelude::*;

declare_id!("7qmPXRXcGm6BNEGGg5y3Mr6Cw4Z1gYFY9jDRgzEv5RFS");

pub mod constants;
pub mod errors;
pub mod instructions;
pub mod math;
pub mod state;

pub use instructions::*;
pub use state::*;

#[program]
pub mod pump_fun_like {
    use super::*;

    pub fn initialize_config(
        ctx: Context<InitializeConfig>,
        args: InitializeConfigArgs,
    ) -> Result<()> {
        initialize_config::handler(ctx, args)
    }

    pub fn update_fee(ctx: Context<UpdateFee>, args: UpdateFeeArgs) -> Result<()> {
        update_fee::handler(ctx, args)
    }

    pub fn create<'a, 'b, 'c, 'info>(
        ctx: Context<'a, 'b, 'c, 'info, Create<'info>>,
        args: CreateArgs,
    ) -> Result<()> {
        create::handler(ctx, args)
    }

    pub fn buy(ctx: Context<Buy>, args: BuyArgs) -> Result<()> {
        buy::handler(ctx, args)
    }

    pub fn buy_exact_in(ctx: Context<BuyExactIn>, args: BuyExactInArgs) -> Result<()> {
        buy_exact_in::handler(ctx, args)
    }

    pub fn sell(ctx: Context<Sell>, args: SellArgs) -> Result<()> {
        sell::handler(ctx, args)
    }

    pub fn sell_exact_out(ctx: Context<SellExactOut>, args: SellExactOutArgs) -> Result<()> {
        sell_exact_out::handler(ctx, args)
    }
}
