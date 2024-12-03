export function ceil_div(a: bigint, b: bigint): bigint {
  let c = a / b;
  if (c * b == a) {
    return c;
  } else {
    return c + 1n;
  }
}
