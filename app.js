const logger = require("./logger")
const express = require('express');
const path = require('path');
const favicon = require('serve-favicon');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
const bodyParser = require('body-parser');
const busboy = require('connect-busboy');

const routes = require('./routes/index');

const app = express();

// Expensas/Convertidor ref
const { Expensas, AnalizadorPDF } = require('./expensas');
const Conversor = require('./conversor');

app.locals.analizadorPDF = new AnalizadorPDF();
app.locals.expensas = new Expensas("produccion");
app.locals.convertidor = new Conversor(__dirname + "/files");

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'pug');

// uncomment after placing your favicon in /public
//app.use(favicon(__dirname + '/public/favicon.ico'));
app.use(morgan('dev'));
//app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
// default options, immediately start reading from the request stream and
// parsing
app.use(busboy());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// Cargar cuentas para las vistas
app.use(function (req, res, next) {
    res.locals.convertidor = app.locals.convertidor;

    app.locals.expensas.getCuentas(function (err, cuentas) {
        if (err) {
            logger.error({ message: err })
        } else {
            res.locals.cuentas = cuentas;
            res.locals.expensas = app.locals.expensas;
        }
        next();
    });
});

app.use('/', routes);

// catch 404 and forward to error handler
app.use(function (req, res, next) {
    var err = new Error('Not Found');
    err.status = 404;
    next(err);
});

// error handlers

// development error handler
// will print stacktrace
if (app.get('env') === 'development') {
    app.use(function (err, req, res, next) {
        res.status(err.status || 500);
        res.render('error', {
            message: err.message,
            error: err
        });
    });
}

// production error handler
// no stacktraces leaked to user
app.use(function (err, req, res, next) {
    res.status(err.status || 500);
    res.render('error', {
        message: err.message,
        error: {}
    });
});

module.exports = app;
