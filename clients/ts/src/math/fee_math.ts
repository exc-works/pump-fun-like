import { FEE_RATE_BASIS_POINT } from "./constants";

export function buy_fee(pay_amount_without_fee: bigint, maker_fee_rate: bigint): bigint {
  return (pay_amount_without_fee * maker_fee_rate) / FEE_RATE_BASIS_POINT;
}

export function sell_fee(sol_amount: bigint, taker_fee_rate: bigint): bigint {
  return (sol_amount * taker_fee_rate) / FEE_RATE_BASIS_POINT;
}
