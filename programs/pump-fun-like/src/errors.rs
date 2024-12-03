use anchor_lang::prelude::*;

#[error_code]
pub enum Error {
    /// code = 6000
    #[msg("Invalid taker fee rate")]
    InvalidTakerFeeRate,
    /// code = 6001
    #[msg("Invalid maker fee rate")]
    InvalidMakerFeeRate,
    /// code = 6002
    #[msg("Authority mismatch")]
    AuthorityMismatch,
    /// code = 6003
    #[msg("Fee recipient mismatch")]
    FeeRecipientMismatch,
    /// code = 6004
    #[msg("Sol vault account mismatch")]
    SolVaultAccountMismatch,
    /// code = 6005
    #[msg("Invalid symbol")]
    InvalidSymbol,
    /// code = 6006
    #[msg("Config account mismatch")]
    ConfigAccountMismatch,
    /// code = 6007
    #[msg("Coin vault mismatch")]
    CoinVaultMismatch,
    /// code = 6008
    #[msg("Coin mint account mismatch")]
    CoinMintAccountMismatch,
    /// code = 6009
    #[msg("Insufficient supply")]
    InsufficientSupply,
    /// code = 6010
    #[msg("Max pay exceeded")]
    MaxPayExceeded,
    /// code = 6011
    #[msg("Insufficient receive")]
    InsufficientReceive,
    /// code = 6012
    #[msg("Already launched")]
    AlreadyLaunched,
    /// code = 6013
    #[msg("Exact out too large")]
    ExactOutTooLarge,
    /// code = 6014
    #[msg("Unexpect exact output")]
    UnexpectExactOutput,
    /// code = 6015
    #[msg("Invalid receive")]
    InvalidReceive,
}
