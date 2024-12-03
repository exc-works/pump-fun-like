use crate::{
    constants::{MAX_COIN_SUPPLY, MAX_VIRTUAL_COIN_RESERVES, SELLABLE_COINS, VIRTUAL_SOL_REVERSES},
    errors::Error,
};

/// Calculates the amount of coin to be bought.
///
/// # Parameters
/// - `remaining_coin_supply`: The remaining supply of the coin, including the [crate::constants::REVERSE_COINS].
/// - `amount`: The amount of sol to be paid.
///
/// # Returns
/// The amount of coin to be bought.
pub fn buy(remaining_coin_supply: u64, amount: u64) -> u64 {
    let already_sold = MAX_COIN_SUPPLY - remaining_coin_supply;
    let numerator: u128 = already_sold as u128 * VIRTUAL_SOL_REVERSES as u128;
    let denominator = MAX_VIRTUAL_COIN_RESERVES - already_sold;
    let sol_before = numerator / denominator as u128; // why not use ceil_div here? see why_round_down.png

    let sol_after = sol_before + amount as u128;
    let numerator = sol_after * MAX_VIRTUAL_COIN_RESERVES as u128;
    let denominator = VIRTUAL_SOL_REVERSES as u128 + sol_after;
    let coin_after = numerator / denominator;
    if coin_after <= already_sold as u128 {
        0
    } else if coin_after >= SELLABLE_COINS as u128 {
        (SELLABLE_COINS - already_sold) as u64
    } else {
        (coin_after - already_sold as u128) as u64
    }
}

/// Calculates the amount of coin to be sold.
///
/// # Parameters
/// - `remaining_supply`: The remaining supply of the coin, including the [crate::constants::REVERSE_COINS].
/// - `amount`: The amount of sol to be received.
///
/// # Returns
/// - The amount of coin to be sold.
pub fn sell(remaining_coin_supply: u64, amount: u64) -> Result<u64, Error> {
    let already_sold = MAX_COIN_SUPPLY - remaining_coin_supply;
    let numerator: u128 = already_sold as u128 * VIRTUAL_SOL_REVERSES as u128;
    let denominator = MAX_VIRTUAL_COIN_RESERVES - already_sold;
    let sol_before = numerator / denominator as u128; // why not use ceil_div here? see why_round_down_for_sell.png

    if (sol_before as u64) < amount {
        return Err(Error::ExactOutTooLarge.into());
    } else if (sol_before as u64) == amount {
        // special case: if sol_before is less than amount, it means all sold coins need to be returned
        return Ok(already_sold);
    }

    let sol_after = sol_before - amount as u128;
    let numerator = sol_after * MAX_VIRTUAL_COIN_RESERVES as u128;
    let denominator = VIRTUAL_SOL_REVERSES as u128 + sol_after;
    let coin_after = numerator / denominator;
    if coin_after >= already_sold as u128 {
        Err(Error::UnexpectExactOutput.into())
    } else {
        Ok((already_sold - coin_after as u64) as u64)
    }
}

#[cfg(test)]
mod tests {
    use anchor_lang::solana_program::native_token::LAMPORTS_PER_SOL;

    use crate::{constants::REVERSE_COINS, math::coin_math};

    use super::*;

    #[test]
    pub fn test_buy_already_sold_is_0_and_buy_all() {
        let coin = buy(MAX_COIN_SUPPLY, 85005359057);
        assert_eq!(coin, 793100000000000);
    }

    #[test]
    pub fn test_buy_already_sold_is_0_and_buy_all_and_pay_amount_is_too_high() {
        let coin = buy(MAX_COIN_SUPPLY, 85005359057 + LAMPORTS_PER_SOL);
        assert_eq!(coin, 793100000000000);
    }

    #[test]
    pub fn test_buy_already_sold_is_0_and_pay_1() {
        let coin = buy(MAX_COIN_SUPPLY, 1);
        assert_eq!(coin, (0.035766 * 1e6) as u64);
    }

    #[test]
    pub fn test_buy_already_sold_is_0_and_pay_1e8() {
        let coin = buy(MAX_COIN_SUPPLY, 1e8 as u64);
        assert_eq!(coin, (3564784.053156 * 1e6) as u64);
    }

    #[test]
    pub fn test_buy_already_sold_is_0_and_pay_1e9() {
        let coin = buy(MAX_COIN_SUPPLY, 1e9 as u64);
        assert_eq!(coin, 34612903225806);
    }

    #[test]
    pub fn test_buy_already_sold_is_0_and_pay_3333333333() {
        let coin = buy(MAX_COIN_SUPPLY, 3333333333);
        assert_eq!(coin, 107299999990342);
    }

    #[test]
    pub fn test_buy_already_sold_is_2692001940000_and_pay_10e9() {
        let already_sold = 2692001940000;
        let coin = buy(MAX_COIN_SUPPLY - already_sold, 10e9 as u64);

        let buy_sol = coin_math::buy(MAX_COIN_SUPPLY, already_sold + coin);
        let sell_sol = coin_math::sell(MAX_COIN_SUPPLY - already_sold - coin, already_sold + coin);
        let buy_sol_already_sold = coin_math::buy(MAX_COIN_SUPPLY, already_sold);
        assert!(buy_sol >= sell_sol);
        assert!(buy_sol_already_sold + 10e9 as u64 >= sell_sol);
        println!(
            "raw_buy_sol: {}, raw_sell_sol: {}, mixed_buy_sol: {}",
            buy_sol,
            sell_sol,
            buy_sol_already_sold + 10e9 as u64
        );
        assert_eq!(coin, 267073199500706);
    }

    #[test]
    pub fn test_sell_already_sold_is_all() {
        let sol = coin_math::buy(MAX_COIN_SUPPLY, MAX_COIN_SUPPLY - REVERSE_COINS);
        println!("sol: {}", sol);
        let coin = buy(MAX_COIN_SUPPLY, sol);
        assert_eq!(coin, MAX_COIN_SUPPLY - REVERSE_COINS);

        let coin_recover_buy_sell = sell(REVERSE_COINS, sol - 1).unwrap();
        println!("coin_recover_buy_sell: {}", coin_recover_buy_sell);
        assert_eq!(coin_recover_buy_sell, coin);
    }

    #[test]
    pub fn test_pump_fun() {
        let real_token_reserves: u64 = 589359216751050;
        let coin = buy(real_token_reserves + REVERSE_COINS, (0.5 * 1e9) as u64);
        assert_eq!(coin, 11580385658285);
        let coin_recover = sell(
            real_token_reserves + REVERSE_COINS - coin,
            (0.5 * 1e9) as u64,
        )
        .unwrap();
        assert!(coin_recover >= coin);
        println!("diff: {}", coin_recover - coin);

        let coin = buy(real_token_reserves + REVERSE_COINS, (1.0 * 1e9) as u64);
        assert_eq!(coin, 22856276991103);
        let coin_recover = sell(
            real_token_reserves + REVERSE_COINS - coin,
            (1.0 * 1e9) as u64,
        )
        .unwrap();
        assert!(coin_recover >= coin);
        println!("diff: {}", coin_recover - coin);

        let coin = buy(real_token_reserves + REVERSE_COINS, (23.33333 * 1e9) as u64);
        assert_eq!(coin, 336001966735479);
        let coin_recover = sell(
            real_token_reserves + REVERSE_COINS - coin,
            (23.33333 * 1e9) as u64,
        )
        .unwrap();
        assert!(coin_recover >= coin);
        println!("diff: {}", coin_recover - coin);
    }
}
