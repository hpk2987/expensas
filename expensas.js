var fs = require("fs");
var Datastore = require('nedb');
var moment = require('moment');
var spindrift = require('spindrift');


var Expensas = function(dbname,inMemory){
	this.file = dbname;
	this.file2 = "entradas."+dbname;
	this.file3 = "servicios."+dbname;
	console.log("Arrancando desde: " +dbname);
	this.db = {};

	if(inMemory){
		this.db.cuentas = new Datastore({ inMemoryOnly:true });
		this.db.entradas = new Datastore({ inMemoryOnly:true });
		this.db.servicios = new Datastore({ inMemoryOnly:true });
	}else{
		this.db.cuentas = new Datastore({ filename: this.file, autoload: true });
		this.db.entradas = new Datastore({ filename: this.file2, autoload: true });
		this.db.servicios = new Datastore({ filename: this.file3, autoload: true });
	}
}

exports.Expensas = Expensas;

Expensas.prototype.agregarCuenta = function(nombre,callback){
	var cuenta = {nombre:nombre};
	console.log("Agregando cuenta nombre:"+JSON.stringify(cuenta));
	this.db.cuentas.insert(cuenta,callback);
}

Expensas.prototype.agregarEntrada = function(idCuenta,descripcion,monto,callback){
	var entrada = { 
		cuenta:idCuenta, 
		descripcion:descripcion,
		monto:parseFloat(monto),
		fecha:moment().format('DD/MM/YYYY'),
		secs:new Date().getTime()};
	console.log("Agregando entrada:"+JSON.stringify(entrada));
	this.db.entradas.insert(entrada,callback);
}

Expensas.prototype.eliminarEntrada = function(idEntrada,callback){
	console.log("Eliminando entrada: "+idEntrada);
	this.db.entradas.remove({ _id:idEntrada },{},callback);
}

Expensas.prototype.eliminarCuenta = function(idCuenta,callback){
	console.log("Eliminando cuenta :"+idCuenta);
	this.db.cuentas.remove({ _id:idCuenta },{},callback);
}

Expensas.prototype.getCuentas = function(callback){
	this.db.cuentas.find({},callback);
}

Expensas.prototype.getTotalCuenta = function(idCuenta,callback){
	this.db.entradas.find({ cuenta:idCuenta },function(err,docs){
		if(callback){			
			var total=0;			
			for(var i=0;i<docs.length;i++){
				total += parseInt((docs[i].monto*10).toString());
			}
			callback(err,total/10);
		}
	});
}

Expensas.prototype.getEntradas = function(idCuenta,offset,size,callback){
	console.log("Entradas de:"+idCuenta+" | offset:"+offset+" | size:"+size);
	this.db.entradas.find({ cuenta:idCuenta })
					.sort({ secs:-1 })
					.skip(offset)
					.limit(size).exec(function (err, docs) {
		console.log("Entradas obtenidas:"+docs.length);
		callback(docs);
	});
}

Expensas.prototype.countEntradas = function(idCuenta,callback){
	this.db.entradas.count({ cuenta:idCuenta } ,callback);
}

Expensas.prototype.getServicio = function(tipo,cliente,callback){
	var servicio = {
		tipo: tipo,
		cliente: cliente
	};
	
	this.db.servicios.find(servicio,function(err,docs){
		callback(docs[0]);
	});
}

Expensas.prototype.getServicios = function(callback){
	console.log("Obteniendo servicios");
	this.db.servicios.find({}).exec(function (err, docs) {
		console.log("Servicios obtenidas:"+docs.length);
		callback(docs);
	});
}

Expensas.prototype.agregarServicio = function(cuenta,tipo,cliente,nombre,callback){
	var servicio = { 
		cuenta:cuenta,
		tipo:tipo, 
		cliente:cliente,
		nombre:nombre};

	console.log("Intentando agregar: " + JSON.stringify(servicio));
	this.db.servicios.update(servicio,servicio,{ upsert:true },function(err,numReplaced,docs){
		if(docs){
			console.log("Agregando servicio:"+JSON.stringify(docs));
		}
		callback(docs);
	});
}

Expensas.prototype.obtenerDatosPDF = function(archivo,callback,extra){
	var pdf = spindrift(archivo);
	
	var resultado = {
		demorados:[],

		completo:function(){
			return (this.tipo!=null && this.cliente!=null && this.importe!=null);
		},

		ejecutarDemorados:function(valor){
			var local = this;
			this.demorados.forEach(function(f){
				f(valor,local);
			});
			this.demorados=[];
		},

		esAttr:function(valor,regexp1,regexp2,func,relay){
			if(this[relay]){
				this.ejecutarDemorados(valor);
				this[relay]=undefined;
				return false;
			}

			if(valor!=null && valor.match(regexp1)){
				this[relay]=true;
				this.demorados.push(func);
			}else{
				return valor==null?false:valor.match(regexp2);
			}
		},


		esTipo:function(valor){
			return this.esAttr(valor,/^PAGO DE:$/,/^PAGO DE .*$/,this.cargarTipo,'siguienteEsTipo');
		},

		esCliente:function(valor){
			return this.esAttr(valor,/^NRO.DE CLIENTE:$/,/^NRO. DE CLIENTE:.*$/,this.cargarCliente,'siguienteEsCliente');
		},

		esImporte:function(valor){
			return this.esAttr(valor,/^IMPORTE:$/,/^IMPORTE: .*$/,this.cargarImporte,'siguienteEsImporte');
		},

		cargarImporte:function(valor,obj){
			if(obj){
				obj.importe=parseFloat(valor.replace(',','.').replace('$',''));
			}else{
				this.importe=parseFloat(valor.substr(valor.indexOf(':')+3).replace(',','.'));
			}
		},

		cargarCliente:function(valor,obj){
			if(obj){
				obj.cliente=valor;
			}else{
				this.cliente=valor.substr(valor.indexOf(':')+2);
			}
		},

		cargarTipo:function(valor,obj){
			if(obj){
				obj.tipo=valor;
			}else{
				this.tipo=valor.substr(8);
			}
		}
	};

	var ignore=false;
	resultado.archivo = archivo;
	resultado.extra = extra;
	pdf.contentStream().on('data', function(data){
		if(data.type=="string"){

			if(resultado.esTipo(data.string)){
				// TIPO
				resultado.cargarTipo(data.string);
			}

			if(resultado.esCliente(data.string)){
				// CLIENTE
				resultado.cargarCliente(data.string);
			}

			if(resultado.esImporte(data.string)){
				// IMPORTE
				resultado.cargarImporte(data.string);
			}

			if(!ignore && resultado.completo()){
				callback(resultado);
				ignore=true;
			}
		}
	});
	
}

/*function entrenar(){
	
	var myExp = new Expensas("test.db");

	var exludes = [
		'LinkPagos-ABL-Nazarre3187-04-06-2013.pdf',
		'LinkPagos-ABL-casa-C5-11-05-2013.pdf',
		'LinkPagos-Edenor-casa-26-05-2013.pdf',
		'LinkPagos-Metrogas-casa-04-06-2013.pdf',
		'LinkPagos-Patente-Peugeot-04-06-2013.pdf',
		'LinkPagos-Patente-Tiguan-04-06-2013.pdf',
		'LinkPagos-Personal-Alfredo-11-05-2013.pdf',
		'LinkPagos-Telecom-casa-11-05-2013.pdf',
		'LinkPagos-Telecom-casa-19-05-2013.pdf'];

	var dir = '/Volumes/Publico/Pagos';
	// Read the isDirectory
	fs.readdir(dir, function (err, list) {
		// For every file in the list
		var main;
		var functions = [];
		list.forEach(function (file) {
			// Full path of that file
			var path = dir + "/" + file;
			var regexp = /^LinkPagos-([^-]*-[^-]*)-[0-9]{2}-[0-9]{2}-[0-9]{4}\.pdf$/g;
			var match = regexp.exec(file);
			if(match && exludes.indexOf(file)==-1){
				var funct = function(){
					myExp.obtenerDatosPDF(path,function(data){
						myExp.agregarNombreServicio(data.tipo,data.cliente,match[1],function(err,entry){
							functions.splice(0,1)[0]();
							console.log(functions.length);
						});
					});
				};

				console.log(file + " | " + functions.length);
				functions.push(funct);
			}
		});
		functions.push(function(){
			console.log("Funcion final");
			myExp.getServicios(function(docs){
				console.log(docs);
			});
		});
		functions.splice(0,1)[0]();
    });
}

entrenar();*/

/*function pdfTest(){
	var myExp = new Expensas("test.db",true);

	myExp.obtenerDatosPDF('test.pdf',function(data){
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
