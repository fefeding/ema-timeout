
const ema = require('../index.js').create({
        Tavg: 60,
        Thwm: 250,
        Tmax: 500,
        N: 90
});

for(var i=0;i<100;i++) {
    var a = Math.random() * 200;
    var e = ema.update(a);
    var t = ema.get();
    console.log(a, e, t);
}

for(var i=0;i<100;i++) {
    var a = Math.random() * 200 + 500;
    var e = ema.update(a);
    var t = ema.get();
    console.log(a, e, t);
}