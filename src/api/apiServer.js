const express = require('express');
const cors = require('cors');
require('dotenv').config();
const bodyparser = require('body-parser');
// const dbConnection = require('./db/apiDbconnection');
const bankConfigRouter = require('./routers/bankConfig.router');
// const notificationRouter = require('./routers/notification.router');
// const authRouter = require('./routers/auth.router');
// const journalRouter = require('./routers/journal.router');
const transactionRouter = require('./routers/transaction.router');
const preppingRouter = require('./routers/prepping.router');

let app = express();

/** set parser to parse the request data in json format */
app.use(bodyparser.json({ limit: '50mb' }));
app.use(bodyparser.urlencoded({ limit: '50mb', extended: true, parameterLimit: 50000 }));
// app.use(morgan(':date *** :method :: :url ** :response-time'));

// app.use(bodyparser.json());
// app.use(bodyparser.urlencoded({extended : true}));
app.use(cors());

// app.use('/api/journal', journalRouter);
app.use('/api/v1/bank-config', bankConfigRouter);
// app.use('/api/notifier', notificationRouter);
// app.use('/api/auth', authRouter);

app.use('/api/v1/transaction', transactionRouter);
app.use('/api/v1/key-exchange', preppingRouter);

app.listen(process.env.BANK_CONFIG_PORT || "2000", () => {
    console.log(`api is running on ${process.env.BANK_CONFIG_PORT}`);
});

module.exports = app;
