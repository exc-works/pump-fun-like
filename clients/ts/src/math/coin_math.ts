import { MAX_COIN_SUPPLY, MAX_VIRTUAL_COIN_RESERVES, VIRTUAL_SOL_REVERSES } from "./constants";
import { ceil_div } from "./math";

enum Side {
  Buy,
  Sell,
}

export function buy(remaining_coin_supply: bigint, amount: bigint): bigint {
  return calc(remaining_coin_supply, amount, Side.Buy);
}

export function sell(remaining_coin_supply: bigint, amount: bigint): bigint {
  return calc(remaining_coin_supply, amount, Side.Sell);
}

function calc(remaining_coin_supply: bigint, amount: bigint, side: Side): bigint {
  let already_sold = MAX_COIN_SUPPLY - remaining_coin_supply;

  let numerator = already_sold * VIRTUAL_SOL_REVERSES;
  let denominator = MAX_VIRTUAL_COIN_RESERVES - already_sold;

  if (side == Side.Buy) {
    let sol_before = numerator / denominator;

    let already_sold_target = already_sold + amount;
    numerator = already_sold_target * VIRTUAL_SOL_REVERSES;
    denominator = MAX_VIRTUAL_COIN_RESERVES - already_sold_target;
    let sol_after = ceil_div(numerator, denominator);
    return sol_after - sol_before;
  } else {
    let sol_before = ceil_div(numerator, denominator);

    let already_sold_target = already_sold - amount;
    numerator = already_sold_target * VIRTUAL_SOL_REVERSES;
    denominator = MAX_VIRTUAL_COIN_RESERVES - already_sold_target;
    let sol_after = numerator / denominator;
    if (sol_before <= sol_after) {
      return 0n;
    } else {
      return sol_before - sol_after;
    }
  }
}
