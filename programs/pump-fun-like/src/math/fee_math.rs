use crate::constants::FEE_RATE_BASIS_POINT;

/// Calculates the amount of fee to pay when buying coin.
pub fn buy(pay_amount_without_fee: u64, maker_fee_rate: u32) -> u64 {
    (pay_amount_without_fee as u128 * maker_fee_rate as u128 / FEE_RATE_BASIS_POINT as u128) as u64
}

/// Calculates the amount of fee to pay when selling coin.
pub fn sell(sol_amount: u64, taker_fee_rate: u32) -> u64 {
    (sol_amount as u128 * taker_fee_rate as u128 / FEE_RATE_BASIS_POINT as u128) as u64
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    pub fn test_buy_maker_fee_rate_is_0() {
        assert_eq!(buy(0, 0), 0);
        assert_eq!(buy(1, 0), 0);
        assert_eq!(buy(1e9 as u64, 0), 0);
    }

    #[test]
    pub fn test_buy_maker_fee_rate_is_0_dot_005() {
        assert_eq!(
            buy(1e9 as u64, (0.005 * FEE_RATE_BASIS_POINT as f64) as u32),
            5000000
        );
        assert_eq!(
            buy(333 as u64, (0.005 * FEE_RATE_BASIS_POINT as f64) as u32),
            1
        );
    }

    #[test]
    pub fn test_sell_maker_fee_rate_is_0() {
        assert_eq!(sell(0, 0), 0);
        assert_eq!(sell(1, 0), 0);
        assert_eq!(sell(1e9 as u64, 0), 0);
    }

    #[test]
    pub fn test_sell_maker_fee_rate_is_0_dot_005() {
        assert_eq!(
            sell(1e9 as u64, (0.005 * FEE_RATE_BASIS_POINT as f64) as u32),
            5000000
        );
        assert_eq!(
            sell(333 as u64, (0.005 * FEE_RATE_BASIS_POINT as f64) as u32),
            1
        );
    }
}
