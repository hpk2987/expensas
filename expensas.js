var fs = require("fs");
var Datastore = require('nedb');
var moment = require('moment');

var Expensas = function(dbname){
	this.file = dbname;
	this.file2 = "entradas."+dbname;
	console.log("Arrancando desde: " +dbname);
	this.db = {};
	this.db.cuentas = new Datastore({ filename: this.file, autoload: true });
	this.db.entradas = new Datastore({ filename: this.file2, autoload: true });
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
		monto:parseInt(monto),
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

Expensas.prototype.getEntradas = function(idCuenta,callback){
	this.db.entradas.find({ cuenta:idCuenta })
					.sort({ secs:1 }).exec(function (err, docs) {
		callback(docs);
	});
}

function test(){
	if(fs.existsSync("test.db")) {
		fs.unlinkSync("test.db");
		fs.unlinkSync("entradas.test.db");
	}
	
	var myExp = new Expensas("test.db");
	var assert = require('assert');

	/*myExp.agregarCuenta("abc",function(err,newDoc){
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
}

//test();