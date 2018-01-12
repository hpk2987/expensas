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
			.filter(function(e){ return e.cuenta === idCuenta; });
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
			return valor.match(/^PAGO DE/)!==null;
		},

		esCliente:function(valor){
			return (valor.match(/^NRO.[ ]?DE CLIENTE/)!==null) ||
					(valor.match(/^CUIT[ ]*CONTRIBUYENTE/)!==null);
		},

		esImporte:function(valor){
			return valor.match(/^IMPORTE:/)!==null;
		},

		cargarTipo:function(resultado,valor,extra){
			if(extra){
				resultado.datos.tipo= valor.trim();
				return;
			}

			if(valor.match(/^PAGO DE/)!==null){
				resultado.datos.tipo=valor.substr(8).trim();
			}
		},

		cargarImporte:function(resultado,valor,extra){
			if(extra){
				resultado.datos.importe= parseFloat(valor.replace(/\$/,""));
				return;
			}

			if(valor.match(/^IMPORTE:/)!==null){
				resultado.datos.importe=parseFloat(valor.substr(valor.indexOf(':')+3).replace(',','.'));			
			}
		},

		cargarCliente:function(resultado,valor,extra){
			if(extra){
				resultado.datos.cliente = valor;
				return;
			}

			if(valor.match(/^NRO.[ ]?DE CLIENTE/)!==null){
				resultado.datos.cliente=valor.substr(valor.indexOf(':')+2);
			}else {
				resultado.datos.cliente = null;
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

		for (var i = 0; i < textos.length; i++) {
			var texto = decodeURIComponent(textos[i].R[0].T);		
		    
		    if(operaciones.esTipo(texto)){
	    		operaciones.cargarTipo(resultado,texto);
	    		// Esta en la siguiente linea
	    		if(resultado.datos.tipo===""){
	    			i++;
	    			var texto = decodeURIComponent(textos[i].R[0].T);		
	    			operaciones.cargarTipo(resultado,texto,true);
	    		}
			}

			if(operaciones.esCliente(texto)){
				// CLIENTE
				operaciones.cargarCliente(resultado,texto);
				// Esta en la siguiente linea
				if(resultado.datos.cliente===null){
	    			i++;
	    			var texto = decodeURIComponent(textos[i].R[0].T);		
	    			operaciones.cargarCliente(resultado,texto,true);
	    		}
			}

			if(operaciones.esImporte(texto)){
				// IMPORTE
				operaciones.cargarImporte(resultado,texto);
				// Esta en la siguiente linea				
	    		if(isNaN(resultado.datos.importe)){
	    			i++;
	    			var texto = decodeURIComponent(textos[i].R[0].T);		
	    			operaciones.cargarImporte(resultado,texto,true);
	    		}
			}

			if(operaciones.completo(resultado)){
				break;				
			}
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
