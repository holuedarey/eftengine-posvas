
const config = {
    key1: process.env.ACCESS_ROUTE_KEY1,
    kcv1: process.env.ACCESS_ROUTE_KCV1,
    key2: process.env.ACCESS_ROUTE_KEY2,
    kcv2: process.env.ACCESS_ROUTE_KCV2,
    zpk: process.env.ACCESS_ROUTE_ZPK,
    zpk_kcv: process.env.ACCESS_ROUTE_KCV_ZPK,
}

console.log(config);
module.exports = config;
