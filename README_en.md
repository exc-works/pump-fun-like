# Pump.fun Like

## Instructions

### Initialize Config

Initialize the fee rate, fee account, and other configurations.

### UpdateConfig

Update the configuration.

### Create

Create new tokens.

### Buy

Buy a specified amount of tokens.

### BuyExactIn

Buy tokens with a specified amount of SOL.

> Note: The SOL here does not include fees.

### Sell

Sell a specified amount of tokens.

### SellExactOut

Sell tokens to get a specified amount of SOL.

### Migrate (Not Implemented)

Migrate to Raydium.

## Math

Note: The following algorithms do not consider fees.

## Given the amount of tokens to _receive_ $\Delta x$, calculate the amount of SOL to _pay_ $\Delta y$

```math
\begin{align}
y_b &= \frac{x_b * 30^9}{1073^{12} - x_b} \\
y_a &= \frac{(x_b + \Delta x) * 30^9}{1073^12 - (x_b + \Delta x)} \\
\Delta y &= y_a - y_b \\
\end{align}
```

> $x_b$ is the amount of tokens sold before the purchase.

## Given the amount of tokens to _pay_ $\Delta x$, calculate the amount of SOL to _receive_ $\Delta y$

```math
\begin{align}
y_b &= \frac{x_b * 30^9}{1073^{12} - x_b} \\
y_a &= \frac{(x_b - \Delta x) * 30^9}{1073^12 - (x_b - \Delta x)} \\
\Delta y &= y_b - y_a \\
\end{align}
```

> $x_b$ is the amount of tokens sold before the sale.

## Given the amount of SOL to _pay_ $\Delta y$, calculate the amount of tokens to _buy_ $\Delta x$

```math
\begin{align}
y &= \frac{x * 30^9}{1073^{12} - x} \\
\end{align}
\\
\begin{align}
y + \Delta y &= \frac{(x + \Delta x) * 30^9}{1073^{12} - (x + \Delta x)} \\
Y &= y + \Delta y \\
Y &= \frac{(x + \Delta x) * 30^9}{1073^{12} - (x + \Delta x)} \\
\Delta x &= \frac{Y * 1073^{12}}{30^9 + Y} - x \\
\end{align}
```

## Given the amount of SOL to _receive_ $\Delta y$, calculate the amount of tokens to _sell_ $\Delta x$

```math
\begin{align}
y &= \frac{x * 30^9}{1073^{12} - x} \\
\end{align}
\\
\begin{align}
y - \Delta y &= \frac{(x - \Delta x) * 30^9}{1073^{12} - (x - \Delta x)} \\
Y &= y - \Delta y \\
Y &= \frac{(x - \Delta x) * 30^9}{1073^{12} - (x - \Delta x)} \\
\Delta x &=x - \frac{Y * 1073^{12}}{30^9 + Y} \\
\end{align}
```
