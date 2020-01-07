
# ema超时算法

[![NPM version][npm-image]][npm-url]
[![npm download][download-image]][download-url]

[npm-image]: https://img.shields.io/npm/v/ema-timeout.svg?style=flat-square
[npm-url]: https://npmjs.org/package/ema-timeout
[download-image]: https://img.shields.io/npm/dm/ema-timeout.svg?style=flat-square
[download-url]: https://npmjs.org/package/ema-timeout

EMA算法本身是多用于金融行业的，是一种基于增加期望的模型。算法的主要思想是综合利用历史上积累到的数据，预测下一个周期内的期望。我们参考了标准的EMA算法，得到了符合互联网业务特点的用于超时控制的EMA算法。具体的思想主要是引入“平均效应”的概念，用平均响应时间代替固定超时时间，只要平均响应时间没有超时即可，而不是要求每次都不能超时。主要几点：总体情况不能超标；平均情况表现越好，弹性越大；平均情况表现越差，弹性越小。这里的弹性指的是允许毛刺情况的最大响应时间。

- 数据效果展示：[https://jiamao.github.io/ema-timeout/test/index.html](https://jiamao.github.io/ema-timeout/test/index.html)
![效果图](https://raw.githubusercontent.com/jiamao/ema-timeout/master/test/line.png)

## Install

```bash
$ npm i ema-timeout --save
```

## Usage

```js
const ema = require('ema-timeout');

// 因为每个cgi有可能不一样，根据自身业务需求考虑是否要为每个接口create不同的ema计算
const options = {
        Tavg: 55,   //  最低响应时间， 一般用平均响应时间替代
        Thwm: 300,  // 超时时间限制， 确保最坏的时候，所有请求能处理。正常时正确处理的成功率满足需求。
        Tmax: 500,  // 最大弹性时间
        N: 90   // 平滑指数，越小表示平均值越受最近值的影响，太大则对异常响应较慢
    };
const emaObj = ema.create(options);

```
```js
const start = Date.now();
let tdto = emaObj.get(); // 获取当前超时设置时间

// 请求接口指定超时时间
// 这里是你业务请求逻辑
try {
    const result = await request({
        timeout: tdto
    });// 请求接口 

    emaObj.update(Date.now() - start); // 这里是更新当前接口延时时间，以备计算后续超时
}
catch(e) {
    // 把异常指定为最大超时，这样更好的反应接口健康情况
    emaObj.update(Math.max(Date.now() - start, options.Tmax)); 
}    

```

## 适用条件

固定业务逻辑，循环执行，如FastCGI/S++。

程序大部分时间在等待响应，而不是CPU计算或处理I/O中断。

服务是串行处理模式，容易受异常、慢请求阻塞。

响应时间不宜波动过大。

可以接受有损服务。

## License

[MIT](LICENSE)
