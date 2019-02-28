var fs = require("fs");
var Datastore = require('nedb');
var moment = require('moment');
var PDFParser = require("pdf2json");
var request = require('request');
var shortid = require('shortid');

var Expensas = function(serviceRoot,secretKey,cuentasId,entradasId,serviciosId){
	this.secretKey = secretKey;
	this.cuentasId = cuentasId;
	this.entradasId = entradasId;
	this.serviciosId = serviciosId;
	this.serviceRoot=serviceRoot;

	this.cuentasBuffer = null;
}

exports.Expensas = Expensas;

/* =================================================================== */
/* =================================================================== */
/* Bucket ops */
/* =================================================================== */

Expensas.prototype.getBucket = function(bucketId,callback){
	var options = {
		url: this.serviceRoot+bucketId,
		method: "GET",
		headers:{
			'secret-key': this.secretKey
		}
	}

	console.log("=GET= " + this.serviceRoot+bucketId);
	request(options,function(error,response,body){
		console.log("=RESPUESTA GET= "  + body);
		if(error!=null){
			console.error(error);
		}else{
			callback(JSON.parse(body).data);
		}
	});
}

Expensas.prototype.storeBucket = function(bucketId,data,callback){
	var options = {
		url: this.serviceRoot+bucketId,
		method: "PUT",
		headers:{
			'content-type':'application/json',
			'secret-key': this.secretKey
		},
		body: JSON.stringify({
			data: data,
			date: moment().format('DD/MM/YYYY')
		})
	}

	console.log("=PUT= " + this.serviceRoot+bucketId + " | DATA => " + options.body);
	request(options,function(error,response,body){
		console.log("=RESPUESTA PUT= "  + body);
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

Expensas.prototype.getEntradas= function(callback){
	this.getBucket(this.entradasId+"/latest",function(entradas){
		callback(entradas);
	});
}

Expensas.prototype.getEntradasDeCuenta = function(idCuenta,offset,size,callback){
	this.getBucket(this.entradasId+"/latest",function(entradas){
		var ret = entradas
			.filter(function(e){ return e.cuenta === idCuenta; })
			.reverse();
		callback(ret.slice(offset,offset+size));
	});
}

Expensas.prototype.agregarEntrada = function(idCuenta,descripcion,monto,callback){
	_this = this;
	this.getEntradas(function(entradas){
		var entrada = { 
			id: shortid.generate(),
			cuenta:idCuenta, 
			descripcion:descripcion,
			monto:parseFloat(monto),
			fecha:moment().format('DD/MM/YYYY'),
			secs:new Date().getTime()
		};

		entradas.push(entrada);
		_this.storeBucket(_this.entradasId,entradas,function(){
			callback(entrada);
		});
	});	
}

Expensas.prototype.eliminarEntrada = function(idEntrada,callback){
	_this = this;
	this.getEntradas(function(entradas){
		entradas = entradas.filter(function(e){ return e.id!=idEntrada; });		
		_this.storeBucket(_this.entradasId,entradas,callback);
	});
}

Expensas.prototype.getCuentas = function(callback){
	var _this = this;
	if(this.cuentasBuffer!=null){
		callback(this.cuentasBuffer);
	}else{
		this.getBucket(this.cuentasId+"/latest",function(cuentas){
			_this.cuentasBuffer = cuentas;
			callback(cuentas);
		});
	}
}

Expensas.prototype.agregarCuenta = function(nombre,callback){	
	_this = this;
	this.getCuentas(function(cuentas){
		var cuenta = {
			id: shortid.generate(),
			nombre:nombre
		};

		cuentas.push(cuenta);
		_this.cuentasBuffer.push(cuenta);
		_this.storeBucket(_this.cuentasId,cuentas,function(){
			callback(cuenta);
		});
	});	
}

Expensas.prototype.eliminarCuenta = function(idCuenta,callback){
	_this = this;
	this.getCuentas(function(cuentas){
		cuentas = cuentas.filter(function(e){ return e.id!=idCuenta; });
		_this.cuentasBuffer = cuentas;
		_this.storeBucket(_this.cuentasId,cuentas,callback);
	});
}

Expensas.prototype.getCuenta = function(id,callback){
	this.getCuentas(function(cuentas){
		callback(cuentas.find(function(e){ return e.id === id; }));
	});
}

Expensas.prototype.getTotalCuenta = function(idCuenta,callback){
	this.getEntradas(function(entradas){
		var total = 0;
		if(entradas.length!=0){
			total = entradas			
				.filter(function(e){ return e.cuenta === idCuenta; })
				.map(function(e){ return e.monto; })
				.reduce(function(acum,current){ return acum + current; });
		}


		if(callback){
			callback(total);
		}
	});
}

Expensas.prototype.getEntradasHoy = function(idCuenta,callback){
	var hoy = moment().format('DD/MM/YYYY');

	this.getEntradasDeCuenta(idCuenta,0,100,function(entradas){
		var ret = entradas
			.filter(function(e){ 
				return 	(e.fecha === hoy) });
		
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
		cuentas.forEach(function(cuenta){
			funcs.push(function(){
				_this.getEntradasHoy(cuenta.id,function(entradas){
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
	this.getBucket(this.serviciosId+"/latest",function(servicios){
		callback(servicios);
	})
}

Expensas.prototype.getServicio = function(tipo,cliente,callback){
	this.getServicios(function(servicios){
		var servicio = servicios.find(function(e){
			return 	(e.tipo === tipo) && 
					(e.cliente===cliente);
		});
		callback(servicio);
	});
}

Expensas.prototype.eliminarServicio = function(idServicio,callback){
	_this = this;
	this.getServicios(function(servicios){
		servicios = servicios.filter(function(e){ return e.id!=idServicio; });
		_this.storeBucket(_this.serviciosId,servicios,callback);
	});
}

Expensas.prototype.agregarServicio = function(cuenta,tipo,cliente,nombre,callback){
	_this = this;
	this.getServicios(function(servicios){		
		var servicio = {
			id: shortid.generate(),
			cuenta:cuenta,
			tipo:tipo, 
			cliente:cliente,
			nombre:nombre
		};
		servicios.push(servicio);
		_this.storeBucket(_this.serviciosId,servicios,function(){
			callback(servicio);
		});
	});
}

/* =================================================================== */
/* =================================================================== */
/* PDF ops */
/* =================================================================== */

Expensas.prototype.obtenerDatosPDF = function(archivo,callback,extra){
	var pdfParser = new PDFParser();
	
	var resultado = {
		datos:{}
	};
	var operaciones = {
		completo:function(resultado){
			return (resultado.datos.tipo!=null && resultado.datos.cliente!=null && resultado.datos.importe!=null);
		},

		esTipo:function(valor){
			return valor.match(/^PAGO DE/i)!==null ||
					valor.match(/^abonado/i)!==null ||
					valor.match(/^Descripción Pago/i)!==null;
		},

		esCliente:function(valor){
			return (valor.match(/^NRO.[ ]?DE CLIENTE/i)!==null) ||
					(valor.match(/^CUIT[ ]*CONTRIBUYENTE/i)!==null);
		},

		esImporte:function(valor){
			return valor.match(/^IMPORTE:/i)!==null ||
					valor.match(/IMPORTE$/i)!==null;
		},

		cargarTipo:function(resultado,valor){
			if(valor.match(/ - Comprobante$/)){
				valor = valor.replace(/ - Comprobante$/,"");
			}

			if(valor.match(/^PAGO DE/i)!==null){
				resultado.datos.tipo=valor.substr(8).trim();
			}

			if(valor.match(/^abonado/i)!==null){
				resultado.datos.tipo=valor.substr(9).trim();
			}

			if(valor.match(/^Descripción Pago/i)!==null){
				resultado.datos.tipo=valor.substr(17).trim();
			}
		},

		cargarImporte:function(resultado,valor){
			if(valor.match(/^IMPORTE:/i)!==null){
				resultado.datos.importe=parseFloat(valor.substr(valor.indexOf(':')+3).replace(',','.'));			
			}

			if(valor.match(/IMPORTE$/i)!==null){
				resultado.datos.importe=parseFloat(valor.replace(/IMPORTE$/i,'').trim().replace(',','.'));			
			}
		},

		cargarCliente:function(resultado,valor){
			if((valor.match(/^NRO.[ ]?DE CLIENTE/i)!==null) ||
				(valor.match(/^CUIT[ ]*CONTRIBUYENTE/i)!==null)){

				if(valor.indexOf(':')!==-1){
					resultado.datos.cliente=valor.substr(valor.indexOf(':')+2);
				}else{
					resultado.datos.cliente=valor.substr(19);
				}
			}
		},
	};

	var ignore=false;
	resultado.archivo = archivo;
	resultado.extra = extra;

	pdfParser.on("pdfParser_dataError", errData => console.error(errData.parserError) );
    
    pdfParser.on("pdfParser_dataReady", pdfData => {
		// Son comprobantes siempre tienen una sola pagina
		var textos = pdfData.formImage.Pages[0].Texts;

		var beVerbose = process.env.EXPENSAS_MODO.match(/DEBUG/g) && process.env.EXPENSAS_MODO.match(/VERBOSE/g);

		if(beVerbose){
			console.log("=DEBUG= Full pdf text parse");
			console.log("=DEBUG=" + JSON.stringify(textos));
		}

		// Agrupar como lineas textos con la misma coordenada "y"
		var agrupados = {};
		for (var i = 0; i < textos.length; i++) {
			var coordenadaY = Math.floor(textos[i].y);
			if(agrupados[coordenadaY.toString()] === undefined){
				agrupados[coordenadaY.toString()] = {texto: ""};
			}
			
			agrupados[coordenadaY.toString()].texto +=  decodeURIComponent(textos[i].R[0].T) + " ";
		}

		for(var key in agrupados){
			var texto = agrupados[key].texto.trim();
			
			if(beVerbose){
				console.log("=DEBUG= Texto=" + texto);
				console.log("=DEBUG= Linea Y=" + key);
				console.log("=DEBUG= Es Tipo = " + operaciones.esTipo(texto));
				console.log("=DEBUG= Es Cliente = " + operaciones.esCliente(texto));
				console.log("=DEBUG= Es Importe = " + operaciones.esImporte(texto));				
				console.log("=DEBUG= Resultado=" + JSON.stringify(resultado));
			}

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
		};

		if(beVerbose){
			console.log("=DEBUG= Texto=" + texto);
			console.log("=DEBUG= Linea Y=" + key);
			console.log("=DEBUG= Es Tipo = " + operaciones.esTipo(texto));
			console.log("=DEBUG= Es Cliente = " + operaciones.esCliente(texto));
			console.log("=DEBUG= Es Importe = " + operaciones.esImporte(texto));				
			console.log("=DEBUG= Resultado=" + JSON.stringify(resultado));
		}


		resultado.completo=operaciones.completo(resultado);
		if(!resultado.completo){
			console.error("=ERROR= No se completo el resultado => " + JSON.stringify(resultado));
		}

		callback(resultado);
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
