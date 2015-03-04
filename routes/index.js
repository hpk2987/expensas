var fs = require('fs');
var express = require('express');
var router = express.Router();
var busboy = require('connect-busboy');
var moment = require('moment');
var conv = require('../convertidor');

/* GET home page. */
router.get('/', function(req, res, next) {
	
	res.locals.expensas.getResumenHoy(function(resumen){
		console.log(resumen);
		res.render('index',{resumen: resumen});
	});
});

router.get('/cuenta', function(req, res, next) {
	res.locals.expensas.getCuenta(req.query.id,function(err,cuentas){
		res.locals.expensas.getEntradas(req.query.id,0,100,function(docs){
			res.locals.expensas.getTotalCuenta(req.query.id,function(err,total){
				res.render('cuenta',{ 
					cuenta_actual:req.query.id,
					modificador:cuentas[0].modificador,
					entradas:docs,
					total:total });
			})
		});
	});
});

router.post('/eliminar_entrada', function(req, res, next) {
	res.locals.expensas.eliminarEntrada(req.body.id,function(){
		res.redirect('/cuenta?id='+req.body.cuenta_id);
	});
});

router.post('/agregar_entrada', function(req, res, next) {
	res.locals.expensas.agregarEntrada(
		req.body.cuenta_id,
		req.body.descripcion,
		req.body.monto,
		function(err,newDocs){
			res.redirect('/cuenta?id='+req.body.cuenta_id);
	});
});

router.post('/eliminar_cuenta', function(req, res, next) {
	res.locals.expensas.eliminarCuenta(req.body.id,function(){
		res.redirect('/');
	});
});

router.post('/agregar_cuenta', function(req, res, next) {
	res.locals.expensas.agregarCuenta(req.body.nombre,function(err,newDocs){
		res.redirect('/cuenta?id='+newDocs._id);
	});
});

router.post('/agregar_servicio', function(req, res, next) {
	res.locals.expensas.agregarServicio(
		req.body.cuenta,
		req.body.tipo,
		req.body.cliente,
		req.body.nombre,
		function(newDocs){
			res.redirect('/');
		});
});

/****************************/
/** Manejo de comprobantes **/
/****************************/

var agregarNuevaEntrada = function(resultado){
	resultado.extra.expensas.getCuenta(resultado.servicio.cuenta,function(err,docs){
		resultado.extra.expensas.agregarEntrada(
			resultado.servicio.cuenta,
			resultado.servicio.nombre,
			resultado.importe*docs[0].modificador,
			function(err,newDocs){
				resultado.extra.callback();
		});
	});
}

var renombrarArchivo = function(resultado){
	console.log(resultado);
	resultado.extra.expensas.getServicio(
		resultado.tipo,resultado.cliente,function(servicio){
			if(servicio){
				resultado.servicio=servicio;
				console.log("Servicio:");
				console.log(servicio);
				var nuevo = __dirname + "/../files/" + "LinkPagos-"+servicio.nombre+"-"+moment().format('DD-MM-YYYY')+".pdf";
				console.log("Renombrando a : "+ nuevo);
				fs.rename(resultado.extra.archivo,nuevo,function(){
					// TODO: Copiar el archivo al server por smb
					agregarNuevaEntrada(resultado);
				});
			}else{
				console.log("ERROR: {cliente:"+resultado.cliente+" , tipo:"+resultado.tipo+" no esta en la base de datos");
				resultado.extra.callback("ERROR: {cliente:"+resultado.cliente+" , tipo:"+resultado.tipo+" no esta en la base de datos");
			}
		});
}

router.post('/cargar_comprobante', function(req, res, next) {
	req.pipe(req.busboy);
    req.busboy.on('file', function (fieldname, file, filename) {
        console.log("Uploading: " + filename); 
        var path = __dirname + '/../files/' + filename;
    	var fstream = fs.createWriteStream(path);
        file.pipe(fstream);
        fstream.on('close', function () {
            
            res.locals.expensas.obtenerDatosPDF(
            	path,
            	renombrarArchivo,{
            		archivo:path,
            		expensas: res.locals.expensas,
            		callback: function(err){
            			if(err){
            				res.status(500).send(err);
            			}else{
            				res.redirect('back');
            			}
            		}
            	});
        });
    });	
});

router.get('/descargar_agrupado', function(req, res, next) {
	fs.readFile(__dirname + "/../files/agrupado.pdf", function (err,data){
	     res.contentType("application/pdf");
	     res.send(data);
  	});
});

router.post('/cargar_pdf', function(req, res, next) {
	req.pipe(req.busboy);

	var convertidor = new conv.Convertidor();
	var files=[];
    req.busboy.on('file', function (fieldname, file, filename) {
		var path = __dirname + '/../files/' + filename;
		console.log("Cargando: " + filename);
		
		var fstream = fs.createWriteStream(path);
		file.pipe(fstream);
		
		files.push(path);
	});



    req.busboy.on('finish', function(){
        console.log('Se cargaron todos los archivos ' + files);
        console.log('Convirtiendo...');
        convertidor.convertir(files,__dirname + "/../files",function(filename){
        	console.log('Se genero pdf ' + filename + ' enviando...');
        	res.redirect('back');
        })        
    });
});

module.exports = router;
	