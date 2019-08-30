
/**
 * 创建EMA算法对象
 * 适应循环执行，程序大部分在等待响应，有柔性处理
 * 
 * @param {Object} options 格式 {
 *      Tavg: 最低响应时间， 一般用平均响应时间替代 (ms)
 *      Thwm：超时时间限制， 确保最坏的时候，所有请求能处理。正常时正确处理的成功率满足需求。 (ms)
 *      Tmax: 最大弹性时间 (ms)
 *      N: 平滑指数，越小表示平无值越受最近值的影响，太大则对异常响应较慢
 * }
 */
exports.create = function(options) {
    options = Object.assign({
        Tavg: 60,
        Thwm: 250,
        Tmax: 500,
        N: 80
    }, options);

    return {
        options: options,
        ema: 0, // 当前ema值
        r: 2/(options.N + 1),   // 平滑指数
        /**
         * 更新最近延时时间 ， 计算当前ema
         * @param {*} x 当前延时时间 (ms)
         */
        update: function(x) {
            var ema = x * this.r + this.ema * (1 - this.r);
            return this.ema = ema;
        },
        /**
         * 获取当前延时时间 (ms)
         * @returns {Number} 延时时间(ms)
         */
        get: function() {
            var tdto = 0; // 当前延时间间
            //  EMA <= Tavg， 这种情况EMA评估值比Tavg还要少，按耗时越少，给的延时越多的原则来计算，当前给的延时时间为Tmax。
            if(this.ema <= this.options.Tavg) tdto = this.options.Tmax;    
            // EMA >= Thwm, 这种情况下，网络抖动比较严重，直接把延时限制在Thwm上，加快失败，方便进行柔性处理。
            else if(this.ema >= this.options.thwm) {
                tdto = this.options.thwm;
            }
            // EMA > Tavg, 这种情况EMA估值已经大于平均延时，此时启用动态延时计算
            else {
                var p = (this.options.Thwm - this.ema) / (this.options.Thwm - this.options.Tavg); // 平无表现相对限制的偏移比例，相当于弹性
                tdto = this.options.Thwm + p * (this.options.Tmax - this.options.Thwm);
            }
            return Math.abs(tdto);
        }
    }
}