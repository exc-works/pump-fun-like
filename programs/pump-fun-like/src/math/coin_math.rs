use super::math;
use crate::constants::{MAX_COIN_SUPPLY, MAX_VIRTUAL_COIN_RESERVES, VIRTUAL_SOL_REVERSES};

#[derive(PartialEq, Eq)]
pub enum Side {
    Buy,
    Sell,
}

/// Calculates the amount of sol to be paid.
///
/// The `remaining_coin_supply` is the remaining supply of the coin, including the [crate::constants::REVERSE_COINS].
/// The `amount` is the amount of coin to be bought.
pub fn buy(remaining_coin_supply: u64, amount: u64) -> u64 {
    calc(remaining_coin_supply, amount, Side::Buy)
}

/// Calculates the amount of sol to be received.
///
/// The `remaining_coin_supply` is the remaining supply of the coin, including the [crate::constants::REVERSE_COINS].
/// The `amount` is the amount of coin to be sold.
pub fn sell(remaining_coin_supply: u64, amount: u64) -> u64 {
    calc(remaining_coin_supply, amount, Side::Sell)
}

/// Calculates the amount of sol to be paid or received.
///
/// The `remaining_coin_supply` is the remaining supply of the coin, including the [crate::constants::REVERSE_COINS].
fn calc(remaining_coin_supply: u64, amount: u64, side: Side) -> u64 {
    let already_sold = MAX_COIN_SUPPLY - remaining_coin_supply;

    let numerator: u128 = already_sold as u128 * VIRTUAL_SOL_REVERSES as u128;
    let denominator = MAX_VIRTUAL_COIN_RESERVES - already_sold;

    match side {
        Side::Buy => {
            let sol_before = numerator / denominator as u128;

            let already_sold_target = already_sold + amount;
            let numerator = already_sold_target as u128 * VIRTUAL_SOL_REVERSES as u128;
            let denominator = MAX_VIRTUAL_COIN_RESERVES - already_sold_target;
            let sol_after = math::ceil_div(numerator, denominator as u128);
            (sol_after - sol_before) as u64
        }
        Side::Sell => {
            let sol_before = math::ceil_div(numerator, denominator as u128);

            let already_sold_target = already_sold - amount;
            let numerator = already_sold_target as u128 * VIRTUAL_SOL_REVERSES as u128;
            let denominator = MAX_VIRTUAL_COIN_RESERVES - already_sold_target;
            let sol_after = numerator / denominator as u128;
            if sol_before <= sol_after {
                0
            } else {
                (sol_before - sol_after) as u64
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use crate::{
        constants::{FEE_RATE_BASIS_POINT, REVERSE_COINS},
        math::fee_math,
    };

    use super::*;

    #[test]
    fn test_buy_already_sold_is_0_and_buy_all() {
        let sol = buy(MAX_COIN_SUPPLY, MAX_COIN_SUPPLY - REVERSE_COINS);
        assert_eq!(sol, 85005359057);
        let sol_with_fee = sol + fee_math::buy(sol, FEE_RATE_BASIS_POINT * 1 / 100);
        assert_eq!(sol_with_fee, 85855412647);
    }

    #[test]
    fn test_buy_already_sold_is_0_and_buy_half() {
        let sol = buy(MAX_COIN_SUPPLY, (MAX_COIN_SUPPLY - REVERSE_COINS) / 2);
        assert_eq!(sol, 17586665681 + 1);
        let sol_with_fee = sol + fee_math::buy(sol, FEE_RATE_BASIS_POINT * 1 / 100);
        assert_eq!(sol_with_fee, 17762532338);
    }

    #[test]
    fn test_buy_already_sold_is_0_and_buy_1() {
        let sol = buy(MAX_COIN_SUPPLY, 1);
        assert_eq!(sol, 0 + 1);
    }

    #[test]
    fn test_buy_already_sold_is_2329803488261_and_buy_17514483287344() {
        let already_sold = 2329803488261;
        let sol = buy(MAX_COIN_SUPPLY - already_sold, 17514483287344);
        assert_eq!(sol, 500000001);
    }

    #[test]
    fn test_pump_fun() {
        let real_token_reserves: u64 = 589359216751050;
        let sol = buy(
            real_token_reserves + REVERSE_COINS,
            1100e4 as u64 * 1e6 as u64,
        );
        assert_eq!(sol, 474619833);
        let sol_with_fee = sol + fee_math::buy(sol, FEE_RATE_BASIS_POINT * 1 / 100);
        assert_eq!(sol_with_fee, 479366031);

        let sol = sell(
            real_token_reserves + REVERSE_COINS,
            1100e4 as u64 * 1e6 as u64,
        );
        assert_eq!(sol, 462757832);
        let sol_with_fee = sol - fee_math::sell(sol, FEE_RATE_BASIS_POINT * 1 / 100);
        assert_eq!(sol_with_fee, 458130254);
    }
}
