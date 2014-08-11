var fs = require("fs");
var Datastore = require('nedb');

var Expensas = function(dbname){
	this.file = dbname;
	console.log("Arrancando desde: " +dbname);
	this.db = new Datastore({ filename: this.file, autoload: true });
	var db = this.db;
}

exports.Expensas = Expensas;

Expensas.prototype.agregarCuenta = function(nombre){
	console.log("Agregando cuenta nombre:"+nombre);
	this.db.insert({nombre:nombre,entradas:[]});
}

Expensas.prototype.agregarEntrada = function(cuenta,entrada,callback){
	console.log("Agregando entrada:"+JSON.stringify(entrada)+" a cuenta:"+ cuenta.nombre);
	this.db.update({ nombre:cuenta.nombre},{ $push: { entradas: entrada } },callback);
}

Expensas.prototype.eliminarCuenta = function(nombre){
	console.log("Eliminando cuenta id:"+nombre);
	this.db.remove({ nombre:nombre });
}

Expensas.prototype.getCuentas = function(callback){
	this.db.find({}, function (err, docs) {
		callback(docs);
	});
}

Expensas.prototype.getCuenta = function(nombre,callback){
	this.db.find({ nombre:nombre }, function (err, doc) {
		callback(doc);
	});
}

function test(){
	if(fs.existsSync("test.db")) {
		fs.unlinkSync("test.db");
	}
	
	var myExp = new Expensas("test.db");
	
	myExp.agregarCuenta("abc");
	myExp.getCuentas(function(docs){
		assert.equal(1,docs.length);
	});
	
	myExp.eliminarCuenta("abc");
	
	var assert = require('assert');
	myExp.getCuentas(function(docs){
		assert.equal(0,docs.length);
	});
}