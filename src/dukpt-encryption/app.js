const express = require('express');

const bodyParser = require('body-parser');

const indexRoute = require('./routes/index.route');

const app = express();

const PORT = process.env.PORT || 5002;

// Body parser middleware
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());


app.listen(PORT, console.log(`server is running from ${PORT}`));

app.use('/', indexRoute.router);
