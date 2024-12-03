# Pump.fun Like

## Instructions

### Initialize Config

初始化费率、手续费账户等配置

### UpdateConfig

更新配置

### Create

创建新的代币

### Buy

购买指定数量的代币

### BuyExactIn

购买指定 SOL 的代币

> 需要注意的是，这里的 SOL 不包含手续费

### Sell

出售指定数量的代币

### SellExactOut

出售并获取指定数量的 SOL

### Migrate（未实现）

迁移到 Raydium

## Math

注意: 以下算法均不考虑手续费

## 已知要*得到*的代币数量 $\Delta x$，求要*支付*的 $\Delta y$(SOL) 数量

```math
\begin{align}
y_b &= \frac{x_b * 30^9}{1073^{12} - x_b} \\
y_a &= \frac{(x_b + \Delta x) * 30^9}{1073^12 - (x_b + \Delta x)} \\
\Delta y &= y_a - y_b \\
\end{align}
```

> $x_b$ 为购买前的已卖出代币数量

## 已知要*支付*的代币数量 $\Delta x$，求要*得到*的 $\Delta y$(SOL) 数量

```math
\begin{align}
y_b &= \frac{x_b * 30^9}{1073^{12} - x_b} \\
y_a &= \frac{(x_b - \Delta x) * 30^9}{1073^12 - (x_b - \Delta x)} \\
\Delta y &= y_b - y_a \\
\end{align}
```

> $x_b$ 为卖出前的已卖出代币数量

## 已知要*支付*的 $\Delta y$(SOL) 数量，求可*购买*的代币数量 $\Delta x$

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

## 已知要*得到*的 $\Delta y$(SOL) 数量，求要*出售*的代币数量 $\Delta x$

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
