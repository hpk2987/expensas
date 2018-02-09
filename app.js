var fs = require('fs');
var express = require('express');
var path = require('path');
var favicon = require('serve-favicon');
var logger = require('morgan');
var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');
var busboy = require('connect-busboy');

var routes = require('./routes/index');

var app = express();

// Expensas/Convertidor ref
var expensas = require('./expensas');
var convertidor = require('./convertidor');
var serviceRoot = 'https://api.jsonbin.io/b/';
var secretKey = fs.readFileSync('secret.txt','utf-8').trim();
var cuentasId="5a4d282ba8fa173d86ad6842";
var entradasId="5a4d2826a8fa173d86ad6840";
var serviciosId="5a4d27effa0fa33d7b634fe5";
var offsetsId="5a58b31f7cfd5a4dbc6b4af8";

if(process.env.EXPENSAS_MODO==="DEBUG"){
    console.log("=WARNING= INICIANDO EL SERVIDOR EN MODO DEBUG!");
}

console.log("=== Valores de arranque ===");
console.log("secretKey      => " + secretKey);
console.log("cuentasId      => " + cuentasId);
console.log("entradasId     => " + entradasId);
console.log("serviciosId    => " + serviciosId);
console.log("offsetsId      => " + offsetsId);

app.locals.expensas = new expensas.Expensas(
    serviceRoot,
    secretKey,
    cuentasId,
    entradasId,
    serviciosId);

app.locals.convertidor = new convertidor.Convertidor(
    serviceRoot,
    secretKey,
    offsetsId,
    __dirname + "/files");

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'jade');

// uncomment after placing your favicon in /public
//app.use(favicon(__dirname + '/public/favicon.ico'));
app.use(logger('dev'));
//app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
// default options, immediately start reading from the request stream and
// parsing
app.use(busboy());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// Cargar cuentas para las vistas
app.use(function(req, res, next) {
    res.locals.convertidor = app.locals.convertidor;

    app.locals.expensas.getCuentas(function(cuentas){
        res.locals.cuentas = cuentas;
        res.locals.expensas = app.locals.expensas;
        next();
    });
});

app.use('/', routes);

// catch 404 and forward to error handler
app.use(function(req, res, next) {
    var err = new Error('Not Found');
    err.status = 404;
    next(err);
});

// error handlers

// development error handler
// will print stacktrace
if (app.get('env') === 'development') {
    app.use(function(err, req, res, next) {
        res.status(err.status || 500);
        res.render('error', {
            message: err.message,
            error: err
        });
    });
}

// production error handler
// no stacktraces leaked to user
app.use(function(err, req, res, next) {
    res.status(err.status || 500);
    res.render('error', {
        message: err.message,
        error: {}
    });
});

module.exports = app;
