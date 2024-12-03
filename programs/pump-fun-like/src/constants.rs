/// The max fee rate that can be set.
/// Fee amount = amount * fee_rate / FEE_RATE_BASIS_POINT.
pub const FEE_RATE_BASIS_POINT: u32 = 1e8 as u32;

pub const DECIMALS: u8 = 6;
pub const MAX_COIN_SUPPLY: u64 = (10e8 * 1e6) as u64;
pub const REVERSE_COINS: u64 = 2_0690_0000 * 1e6 as u64;
pub const SELLABLE_COINS: u64 = MAX_COIN_SUPPLY - REVERSE_COINS;

pub const COIN_SEED: &str = "coin";
pub const SOL_VAULT_SEED: &str = "coin_sol_vault";

pub const SYMBOL_MIN_LEN: usize = 2;
pub const SYMBOL_MAX_LEN: usize = 10;

pub const VIRTUAL_COIN_RESERVES: u64 = 7300_0000e6 as u64;
pub const MAX_VIRTUAL_COIN_RESERVES: u64 = MAX_COIN_SUPPLY + VIRTUAL_COIN_RESERVES;
pub const VIRTUAL_SOL_REVERSES: u64 = 30e9 as u64;
