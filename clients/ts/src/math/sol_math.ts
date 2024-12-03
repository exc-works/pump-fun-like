import { MAX_COIN_SUPPLY, MAX_VIRTUAL_COIN_RESERVES, SELLABLE_COINS, VIRTUAL_SOL_REVERSES } from "./constants";

export function buy_exact_in(remaining_coin_supply: bigint, amount: bigint): bigint {
  let already_sold = MAX_COIN_SUPPLY - remaining_coin_supply;
  let numerator = already_sold * VIRTUAL_SOL_REVERSES;
  let denominator = MAX_VIRTUAL_COIN_RESERVES - already_sold;
  let sol_before = numerator / denominator;

  let sol_after = sol_before + amount;
  numerator = sol_after * MAX_VIRTUAL_COIN_RESERVES;
  denominator = VIRTUAL_SOL_REVERSES + sol_after;
  let coin_after = numerator / denominator;
  if (coin_after <= already_sold) {
    return 0n;
  } else if (coin_after >= SELLABLE_COINS) {
    return SELLABLE_COINS - already_sold;
  } else {
    return coin_after - already_sold;
  }
}

export function sell_exact_out(remaining_coin_supply: bigint, amount: bigint): bigint {
  let already_sold = MAX_COIN_SUPPLY - remaining_coin_supply;
  let numerator = already_sold * VIRTUAL_SOL_REVERSES;
  let denominator = MAX_VIRTUAL_COIN_RESERVES - already_sold;
  let sol_before = numerator / denominator;

  if (sol_before < amount) {
    throw new Error("Exact out too large");
  } else if (sol_before == amount) {
    // special case: if sol_before is less than amount, it means all sold coins need to be returned
    return already_sold;
  }

  let sol_after = sol_before - amount;
  numerator = sol_after * MAX_VIRTUAL_COIN_RESERVES;
  denominator = VIRTUAL_SOL_REVERSES + sol_after;
  let coin_after = numerator / denominator;
  if (coin_after >= already_sold) {
    throw new Error("Unexpect exact output");
  } else {
    return already_sold - coin_after;
  }
}
