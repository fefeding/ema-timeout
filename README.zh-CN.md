# ema-timeout

[English](./README.md) | 简体中文

[![NPM version][npm-image]][npm-url]
[![npm download][download-image]][download-url]

[npm-image]: https://img.shields.io/npm/v/ema-timeout.svg?style=flat-square
[npm-url]: https://npmjs.org/package/ema-timeout
[download-image]: https://img.shields.io/npm/dm/ema-timeout.svg?style=flat-square
[download-url]: https://npmjs.org/package/ema-timeout

基于观测响应时间的**指数移动平均（EMA）**动态计算请求超时时间。

EMA 多用于金融领域，是一种用历史数据预测下一周期期望的模型。本库把它改造为适合互联网业务的超时控制算法，核心是引入「平均效应」：不要求**每一次**请求都不超时，而是用**平均响应时间**作为健康度信号。设计目标是：

- 总体情况不能超标；
- 平均表现越好，给单个慢请求留的余量（「弹性」）越大；
- 平均表现越差，弹性越小 —— 更快判定失败，便于进行柔性 / 有损处理。

这里的「弹性」指允许毛刺请求消耗的最大响应时间。

[数据效果展示](https://jiamao.github.io/ema-timeout/test/index.html)

![EMA 超时曲线](https://raw.githubusercontent.com/jiamao/ema-timeout/master/test/line.png)

## 特性

- 零依赖、单文件、纯 CommonJS，无定时器、无 I/O。
- 配置校验、派生状态只读、超时显式夹取。
- **无冷启动偏差**：首个样本直接初始化 EMA。
- 提供 `reset()`、`configure()`、`toJSON()`，支持预热、动态调参与可观测性。
- 手写 TypeScript 类型声明 + 断言式测试。

## 安装

```bash
npm i ema-timeout --save
```

```js
const ema = require('ema-timeout');
```

## 算法

`create(options)` 维护 EMA 值 `ema`（初值 `0`）、样本计数与平滑系数

\[
r = \frac{2}{N + 1}, \qquad ema \leftarrow x \cdot r + ema \cdot (1 - r)
\]

其中 `x` 是最近一次观测到的耗时（ms）。**首个样本直接初始化 EMA**（`ema = x`），因此推荐超时从第一次请求起就反映真实耗时，而不是在约 `N` 个请求内一直停在 `Tmax`。

`get()` 把 EMA 映射为超时时间：

| 条件 | 结果 | 含义 |
| --- | --- | --- |
| `ema <= Tavg` | `Tmax` | 健康度优于基线，给最大弹性 |
| `ema >= Thwm` | `Thwm` | 耗时持续偏高，收紧到高水位，快速失败 |
| 其他 | `Thwm + p * (Tmax - Thwm)`，其中 `p = (Thwm - ema) / (Thwm - Tavg)` | 在两个边界之间线性插值 |

结果会显式夹取到 `[0, Tmax]`。配置经过校验，保证 `Tmax >= Thwm > Tavg >= 0` 且 `N >= 1`，从而插值区间始终有效。

## API

### `ema.create(options?)`

创建一个独立的超时计算器。`options` 必须是普通对象；`null` / `undefined` 的字段回退到默认值，且**不会修改调用方传入的对象**。非法值会抛 `TypeError` / `RangeError`。

| 参数 | 默认值 | 单位 | 说明 |
| --- | --- | --- | --- |
| `Tavg` | `60` | ms | 最低响应时间，一般用平均响应时间替代；必须 `>= 0` |
| `Thwm` | `250` | ms | 超时时间限制（高水位）；必须 `> Tavg` |
| `Tmax` | `500` | ms | 服务健康时允许的最大弹性时间；必须 `>= Thwm` |
| `N` | `80` | 样本数 | 平滑指数；必须 `>= 1`。越小越受最近值影响，越大对异常响应越慢、收敛越久 |

返回的计算器包含**只读 getter** 与方法：

| 成员 | 类型 | 说明 |
| --- | --- | --- |
| `options` | `Readonly<EmaOptions>` | 冻结且已校验的配置；运行时给任何派生字段赋值都会抛 `TypeError`，请用 `reset()` / `configure()` |
| `ema` | `number` | 当前 EMA（ms） |
| `r` | `number` | `2 / (N + 1)`，配置变化时自动重算 |
| `samples` | `number` | 自创建 / 上次 `reset()` 以来喂入的样本数 |
| `update(x)` | `(number) => number` | 喂入耗时样本，返回新的 EMA |
| `get()` | `() => number` | 建议超时（ms），夹取到 `[0, Tmax]` |
| `reset(initialEma?)` | `(number?) => void` | 清空平均值，或用已知 EMA 预热 |
| `configure(patch)` | `(Partial<EmaOptions>) => Readonly<EmaOptions>` | 校验并应用部分配置更新 |
| `toJSON()` | `() => EmaSnapshot` | `{ options, ema, samples }`，便于持久化 / 日志 |

### `update(x)`

喂入最近一次请求的耗时（ms）。`x` 必须是有限非负数；`NaN`、字符串、`undefined` 与负数会抛错，不会污染 EMA。**成功和失败都要调用**。超时 / 异常时样本至少要反映你允许的超时：

```js
emaObj.update(Math.max(Date.now() - start, options.Tmax));
```

### `get()`

返回当前建议的超时时间。在发起请求前调用，并把它作为该请求的超时参数。

### 模块级导出

| 导出 | 说明 |
| --- | --- |
| `create(options?)` | 计算器工厂 |
| `DEFAULTS` | 冻结的默认值 `{ Tavg: 60, Thwm: 250, Tmax: 500, N: 80 }` |
| `validateConfig(config)` | 提前校验完整配置（非法即抛错） |

## 用法

不同接口 / 依赖的耗时特征不同，建议各自创建独立实例：

```js
const ema = require('ema-timeout');

const options = {
  Tavg: 55,   // 最低响应时间，一般用平均响应时间替代（ms）
  Thwm: 300,  // 超时时间限制（ms）
  Tmax: 500,  // 最大弹性时间（ms）
  N: 90       // 平滑指数
};
const emaObj = ema.create(options);
```

```js
const start = Date.now();
const tdto = emaObj.get(); // 本次请求的推荐超时

try {
  const result = await request({ timeout: tdto }); // 你的业务请求
  emaObj.update(Date.now() - start);
} catch (e) {
  // 把异常指定为至少等于最大超时，更好地反映接口健康情况
  emaObj.update(Math.max(Date.now() - start, options.Tmax));
}
```

动态调参与预热：

```js
emaObj.configure({ N: 40 });      // 从现在起反应更快
emaObj.reset(120);                // 用已知均值预热
console.log(emaObj.toJSON());     // { options, ema, samples }
```

## TypeScript

已随包提供 `index.d.ts`，并在 `types` / `exports` 中声明，无需 `@types`。

```ts
import { create, DEFAULTS, validateConfig, type EmaOptions, type EmaTimeout } from 'ema-timeout';

const options: Partial<EmaOptions> = { Tavg: 55, Thwm: 300, Tmax: 500, N: 90 };
validateConfig({ ...DEFAULTS, ...options });

const calc: EmaTimeout = create(options);
const timeout: number = calc.get();
calc.update(42);
```

导出 `EmaOptions`、`EmaSnapshot`、`EmaTimeout` 与 `Readonly<EmaOptions>`；派生状态为只读，误赋值会在编译期报错。

## 适用条件

- 固定业务逻辑、循环执行，如 FastCGI / S++ 类服务。
- 程序大部分时间在等待响应，而不是 CPU 计算或处理 I/O 中断。
- 服务为串行处理模式，容易被异常、慢请求阻塞。
- 响应时间波动不宜过大。
- 可以接受有损服务 / 柔性降级。

不适合 CPU 密集型任务、耗时分布高度两极化的场景，以及「每次请求都必须满足硬截止时间」的场景 —— 后者请直接用固定超时。

### 调参建议

- `Tavg` 应来自稳态实测，不要凭猜测填写。
- `Thwm` 是硬上限：最坏情况下你能承受的等待时长。
- `Tmax` 只在 EMA 健康时才会达到；远高于 `Thwm` 会放大单次毛刺的代价。
- `N` 决定「平滑 vs 反应速度」的取舍。已有历史均值时用 `reset(knownAverage)` 预热。

## 限制与已知问题

- **相对 1.0.x 的行为变更**：非法配置与非法样本现在会**抛错**，不再静默产生 `NaN`；并强制 `Tmax >= Thwm > Tavg >= 0`、`N >= 1`。升级前请检查现有配置。
- **首样本初始化**：第一次 `update(x)` 直接令 `ema = x`（而非 `x * r`）。这消除了冷启动偏差，但也让首个超时对单个离群值更敏感；如不希望如此，可用 `reset(knownAverage)` 预热。
- **模型极简**：只有普通 EMA，没有百分位 / 方差 / 离群值剔除 / 样本上限，也没有重试退避策略。它不区分超时与成功，需要调用方在样本值里体现。
- **运行时格式**：仅 CommonJS（提供了 TypeScript 声明，但没有 ESM 产物）。
- **图表页**：`test/index.html` 是可视化页面，不是测试运行器；`npm test` 执行 `test/index.js` 的断言测试（15 项）。

## 目录结构

| 路径 | 用途 |
| --- | --- |
| `index.js` | `create()` 与辅助函数 |
| `index.d.ts` | 手写的 TypeScript 类型声明 |
| `test/index.js` | 断言测试（`npm test`） |
| `test/index.html` | 交互式图表（GitHub Pages） |

## 开发

```shell
npm test   # node ./test/index.js —— 15 项断言，无外部依赖
```

## 许可证

MIT © jiamao
