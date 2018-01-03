var fs = require("fs");
var Datastore = require('nedb');
var moment = require('moment');
var PDFParser = require("pdf2json");
var request = require('request');
var shortid = require('shortid');

var Expensas = function(serviceRoot,secretKey,cuentasId,entradasId,serviciosId){
	console.log("=== Valores de arranque ===");
	console.log("secretKey	=> " + secretKey);
	console.log("cuentasId 	=> " + cuentasId);
	console.log("entradasId 	=> " + entradasId);
	console.log("serviciosId 	=> " + serviciosId);

	this.secretKey = secretKey;
	this.cuentasId = cuentasId;
	this.entradasId = entradasId;
	this.serviciosId = serviciosId;
	this.serviceRoot=serviceRoot;
}

exports.Expensas = Expensas;

/* =================================================================== */
/* =================================================================== */
/* Bucket ops */
/* =================================================================== */

Expensas.prototype.getBucket = function(bucketId,callback){
	var options = {
		baseUrl: this.serviceRoot,
		url: bucketId,
		method: "GET",
		headers:{
			'secret-key': this.secretKey
		}
	}

	request(options,function(error,response,body){
		if(error!=null){
			console.error(error);
		}else{
			callback(JSON.parse(body));
		}
	});
}

Expensas.prototype.storeBucket = function(bucketId,data,callback){
	var options = {
		baseUrl: this.serviceRoot,
		url: bucketId,		
		method: "PUT",
		headers:{
			'content-type':'application/json',
			'secret-key': this.secretKeys
		},
		body: JSON.stringify(data)
	}

	request(options,function(error,response,body){
		if(error!=null){
			console.error(error);
		}else{
			callback();
		}
	});
}

/* =================================================================== */
/* =================================================================== */
/* Expensas ops */
/* =================================================================== */7

Expensas.prototype.getCuentas = function(callback){
	this.getBucket(this.cuentasId+"/latest",function(cuentas){
		callback(cuentas);
	});
}

Expensas.prototype.agregarCuenta = function(nombre,callback){	
	this.getCuentas(function(cuentas){
		var cuenta = {
			id: shortid.generate(),
			nombre:nombre
		};

		cuentas.push_back(cuenta);
		this.storeBucket(this.cuentasId,cuentas,callback);
	});	
}

Expensas.prototype.eliminarCuenta = function(idCuenta,callback){
	console.log("Eliminando cuenta :"+idCuenta);
	this.getCuentas(function(cuentas){
		var cuenta = cuentas.find(function(e){ return e.id===idCuenta; });
		if(cuenta!=null){
			cuentas.splice(index, 1);
			this.storeBucket(this.cuentasId,cuentas,callback);
		}
	});
}

Expensas.prototype.getCuenta = function(id,callback){
	this.getCuentas(function(cuentas){
		callback(cuentas.find(function(e){ return e.id === id; }));
	});
}

Expensas.prototype.getEntradas = function(idCuenta,offset,size,callback){
	console.log("Entradas de:"+idCuenta+" | offset:"+offset+" | size:"+size);
	this.getBucket(this.entradasId+"/latest",function(entradas){
		var ret = entradas
			.filter(function(e){ return e.cuenta === idCuenta; });
		callback(ret.slice(offset,offset+limit));
	});
}

Expensas.prototype.agregarEntrada = function(idCuenta,descripcion,monto,callback){
	this.getEntradas(function(entradas){
		var entrada = { 
			id: shortid.generate(),
			cuenta:idCuenta, 
			descripcion:descripcion,
			monto:parseFloat(monto),
			fecha:moment().format('DD/MM/YYYY'),
			secs:new Date().getTime()
		};

		console.log("Agregando entrada:"+JSON.stringify(entrada));
		entradas.push_back(entrada);
		this.storeBucket(this.entradasId,entradas,callback);
	});	
}

Expensas.prototype.eliminarEntrada = function(idEntrada,callback){
	console.log("Eliminando entrada: "+idEntrada);
	this.getEntradas(function(entradas){
		var entrada = entradas.find(function(e){ return e.id===idEntrada; });
		if(entrada!=null){
			entradas.splice(index, 1);
			this.storeBucket(this.entradasId,entradas,callback);
		}
	});
}

Expensas.prototype.getTotalCuenta = function(idCuenta,callback){
	this.getEntradas(function(entradas){
		var total = entradas
			.filter(function(e){ return e.cuenta === idCuenta; })
			.reduce(function(acum,current){ return acum + current; });
		if(callback){
			callback(err,total/10);
		}
	});
}

Expensas.prototype.getEntradasHoy = function(idCuenta,callback){
	var hoy = moment().format('DD/MM/YYYY');

	console.log("Entradas de hoy de:"+idCuenta);

	this.getEntradas(function(entradas){
		var ret = entradas
			.filter(function(e){ 
				return 	(e.cuenta === idCuenta) &&
						(e.fecha === hoy) });
		
		callback(ret);
	});
}


Expensas.prototype.getResumenHoy = function(callback){
	var resumen = {
		cuentas : [],
		fecha: moment().format('DD/MM/YYYY')
	}

	var _this = this;
	this.getCuentas(function(cuentas){
		var funcs = [];
		console.log(cuentas);
		cuentas.forEach(function(cuenta){
			funcs.push(function(){
				_this.getEntradasHoy(cuenta._id,function(entradas){
					if(entradas.length>0){
						//Calcular total
						var total=0;			
						for(var i=0;i<entradas.length;i++){
							total += parseInt((entradas[i].monto*10).toString());
						}
						
						resumen.cuentas.push({
							cuenta:cuenta.nombre,
							entradas:entradas,
							total:total/10
						});
					}

					if(funcs.length>0){
						funcs.splice(0,1)[0]();
					}else{
						callback(resumen);
					}
				});
			});
		});
		if(funcs.length>0){
			funcs.splice(0,1)[0]();
		}
	});
}

Expensas.prototype.countEntradas = function(idCuenta,callback){
	this.getEntradas(idCuenta,function(entradas){
		callback(entradas.length);
	});
}

Expensas.prototype.getServicios = function(callback){
	console.log("Obteniendo servicios");
	this.getBucket(this.serviciosId+"/latest",function(servicios){
		console.log("Servicios obtenidas:"+servicios.length);
		callback(servicios);
	})
}

Expensas.prototype.getServicio = function(tipo,cliente,callback){
	var servicio = {
		tipo: tipo,
		cliente: cliente
	};
	
	this.getServicios(function(servicios){
		var servicio = servicios.filter(function(e){
			return 	(e.tipo === tipo) && 
					(e.cliente===cliente);
		});
		callback(servicio);
	});
}

Expensas.prototype.eliminarServicio = function(idServicio,callback){
	console.log("Eliminando servicio :"+idServicio);
	
	this.getServicios(function(servicios){
		var servicio = servicios.find(function(e){ return e.id===idServicio; });
		if(servicio!=null){
			servicios.splice(index, 1);
			this.storeBucket(this.serviciosId,servicios,callback);
		}
	});
}

Expensas.prototype.agregarServicio = function(cuenta,tipo,cliente,nombre,callback){
	console.log("Intentando agregar: " + JSON.stringify(servicio));
	this.getServicios(function(servicios){		
		var servicio = {
			id: shortid.generate(),
			cuenta:cuenta,
			tipo:tipo, 
			cliente:cliente,
			nombre:nombre
		};
		console.log("Agregando servicio:"+JSON.stringify(docs));

		servicios.push_back(servicio);
		this.storeBucket(this.serviciosId,servicios,callback);
	});
}

/* =================================================================== */
/* =================================================================== */
/* PDF ops */
/* =================================================================== */

Expensas.prototype.obtenerDatosPDF = function(archivo,callback,extra){
	var pdfParser = new PDFParser();
	
	var resultado = {};
	var operaciones = {
		completo:function(resultado){
			return (resultado.tipo!=null && resultado.cliente!=null && resultado.importe!=null);
		},

		esTipo:function(valor){
			return valor.match(/^PAGO DE/)!==null;
		},

		esCliente:function(valor){
			return valor.match(/^NRO.[ ]?DE CLIENTE/)!==null;
		},

		esImporte:function(valor){
			return valor.match(/^IMPORTE:/)!==null;
		},

		cargarTipo:function(resultado,valor){
			resultado.tipo=valor.substr(8);
		},

		cargarImporte:function(resultado,valor){
			resultado.importe=parseFloat(valor.substr(valor.indexOf(':')+3).replace(',','.'));
		},

		cargarCliente:function(resultado,valor){
			resultado.cliente=valor.substr(valor.indexOf(':')+2);
		},
	};

	var ignore=false;
	resultado.archivo = archivo;
	resultado.extra = extra;

	pdfParser.on("pdfParser_dataError", errData => console.error(errData.parserError) );
    
    pdfParser.on("pdfParser_dataReady", pdfData => {
		// Son comprobantes siempre tienen una sola pagina
		var textos = pdfData.formImage.Pages[0].Texts;

		for (var i = 0; i < textos.length; i++) {
			var texto = decodeURIComponent(textos[i].R[0].T);
			
			//console.log(texto);
		    
		    if(operaciones.esTipo(texto)){
	    		operaciones.cargarTipo(resultado,texto);
			}

			if(operaciones.esCliente(texto)){
				// CLIENTE
				operaciones.cargarCliente(resultado,texto);
			}

			if(operaciones.esImporte(texto)){
				// IMPORTE
				operaciones.cargarImporte(resultado,texto);
			}

			if(operaciones.completo(resultado)){
				break;				
			}
		}

		if(!operaciones.completo(resultado)){
			console.error("=ERROR= No se completo el resultado => " + JSON.stringify(resultado));
		}else{
			callback(resultado);     
		}
    });
 
    pdfParser.loadPDF(archivo);
}


/*function pdfTest(){
	var myExp = new Expensas("test.db",true);

	myExp.obtenerDatosPDF('prueba.pdf',function(data){
		console.log(data);
	});
}*/

//pdfTest();

/*function test(){
	if(fs.existsSync("test.db")) {
		fs.unlinkSync("test.db");
		fs.unlinkSync("entradas.test.db");
		fs.unlinkSync("servicios.test.db");
	}
	
	var myExp = new Expensas("test.db");
	var assert = require('assert');

	myExp.agregarCuenta("abc",function(err,newDoc){
		myExp.agregarCuenta("dbc",function(err,newDoc){
			myExp.getCuentas(function(err,docs){
				console.log(JSON.stringify(docs));
				assert.equal(2,docs.length);
			});
		});
	});*/

	/*myExp.agregarCuenta("abc",function(err,newDoc){
		myExp.getCuentas(function(docs){
			console.log(JSON.stringify(docs));
			assert.equal(1,docs.length);

			myExp.agregarEntrada(docs[0]._id,"eee","22",function(err,newDocs){
				myExp.getEntradas(docs[0]._id,function(edocs){
					assert.equal(1,edocs.length);
					
					myExp.eliminarCuenta(docs[0]._id,function(err,numRemoved){
						console.log("Eliminados "+numRemoved);
						assert.equal(1,numRemoved);
					});
				});
			});
		});	
	});*/
/*}

test();*/
