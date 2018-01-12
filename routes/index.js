var fs = require('fs');
var express = require('express');
var router = express.Router();
var busboy = require('connect-busboy');
var moment = require('moment');


/* =================================================================== */
/* =================================================================== */
/* View routes */
/* =================================================================== */

router.get('/', function(req, res, next) {
	
	res.locals.expensas.getResumenHoy(function(resumen){		
		res.render('index',{resumen: resumen});
	});
});

router.get('/cuenta', function(req, res, next) {
	res.locals.expensas.getCuenta(req.query.id,function(cuenta){
		res.locals.expensas.getEntradasDeCuenta(req.query.id,0,100,function(entradas){
			res.locals.expensas.getTotalCuenta(req.query.id,function(total){
				res.render('cuenta',{ 
					cuenta_actual:req.query.id,
					modificador:cuenta.modificador,
					entradas:entradas,
					total:total });
			})
		});
	});
});

router.get('/servicio', function(req, res, next) {
	
	res.locals.expensas.getServicios(function(servicios){
		var funcs = [];
		servicios.forEach(function(servicio){
			funcs.push(function(){
				res.locals.expensas.getCuenta(servicio.cuenta,function(cuenta){
					servicio.cuenta=cuenta;
					if(funcs.length>0){
						funcs.splice(0,1)[0]();
					}else{
						console.log(servicios);
						res.render('servicio',{
							servicio_route: 1,
							servicios:servicios});
					}
				});
			});
			
		});

		if(funcs.length>0){
			funcs.splice(0,1)[0]()
		}else{
			res.render('servicio',{
				servicio_route: 1,
				servicios:[]});
		};
	});
});

/* =================================================================== */
/* =================================================================== */
/* Service routes */
/* =================================================================== */

router.post('/eliminar_servicio', function(req, res, next) {
	res.locals.expensas.eliminarServicio(req.body.id,function(){
		res.redirect('back');
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
		function(entrada){
			res.redirect('/cuenta?id='+req.body.cuenta_id);
	});
});

router.post('/eliminar_cuenta', function(req, res, next) {
	res.locals.expensas.eliminarCuenta(req.body.id,function(){
		res.redirect('/');
	});
});

router.post('/agregar_cuenta', function(req, res, next) {
	res.locals.expensas.agregarCuenta(req.body.nombre,function(cuenta){
		res.redirect('/cuenta?id='+cuenta.id);
	});
});

router.post('/agregar_servicio', function(req, res, next) {
	res.locals.expensas.agregarServicio(
		req.body.cuenta,
		req.body.tipo,
		req.body.cliente,
		req.body.nombre,
		function(servicio){
			res.redirect('back');
		});
});

/****************************/
/** Manejo de comprobantes **/
/****************************/

router.post('/cargar_comprobante', function(req, res, next) {
	req.pipe(req.busboy);
    req.busboy.on('file', function (fieldname, file, filename) {
        console.log("=UPLOADING= " + filename); 
        var path = __dirname + '/../files/' + filename;
    	var fstream = fs.createWriteStream(path);
        file.pipe(fstream);
        fstream.on('close', function () {
            
            res.locals.expensas.obtenerDatosPDF(
            	path,
            	renombrarArchivo,
            	{
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
        res.locals.convertidor.convertir(files,__dirname + "/../files",function(filename){
        	console.log('Se genero pdf ' + filename + ' enviando...');
        	res.redirect('back');
        },res.locals.expensas)
    });
});

/* =================================================================== */
/* =================================================================== */
/* Utility Functions */
/* =================================================================== */

/****************************/
/** Manejo de comprobantes **/
/****************************/

var agregarNuevaEntrada = function(resultado){
	// Si no tiene servicio no se agrega entrada
	if(resultado.servicio.cuenta){
		resultado.extra.expensas.getCuenta(resultado.servicio.cuenta,function(cuenta){
			resultado.extra.expensas.agregarEntrada(
				resultado.servicio.cuenta,
				resultado.servicio.nombre,
				resultado.datos.importe*cuenta.modificador,
				function(entrada){
					resultado.extra.callback();
				});
		});
	}else{
		resultado.extra.callback("ERROR: {cliente:"+resultado.datos.cliente+" , tipo:"+resultado.datos.tipo+" no tiene cuenta asociada");
	}
}

var renombrarArchivo = function(resultado){
	console.log("=UPLOAD COMPLETE= " + JSON.stringify(resultado.datos));
	
	if(!resultado.completo){
		console.log("=ERROR= Extraccion incompleta de datos");
		resultado.extra.callback("ERROR: {mensaje: 'Extraccion incompleta de datos'");
	}else{
		resultado.extra.expensas.getServicio(
			resultado.datos.tipo,resultado.datos.cliente,function(servicio){
				if(servicio!=null && servicio.length>0){
					resultado.servicio=servicio[0];
					console.log("=BINDING= " + JSON.stringify(servicio[0]));
					var nuevo = __dirname + "/../files/" + "TempDoc-"+servicio.nombre+"-"+moment().format('DD-MM-YYYY')+".pdf";
					fs.rename(resultado.extra.archivo,nuevo,function(){
						agregarNuevaEntrada(resultado);
					});
				}else{
					console.log("=ERROR= El cliente "+resultado.datos.cliente+" de tipo "+resultado.datos.tipo+" NO esta en la base de datos");
					resultado.extra.callback("ERROR: {cliente:"+resultado.datos.cliente+" , tipo:"+resultado.datos.tipo+" no esta en la base de datos");
				}
			});
	}
}

module.exports = router;
	