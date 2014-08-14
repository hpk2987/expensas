var http = require('http');
var fs = require('fs');
var path = require('path');
var expensas = require('./expensas');
var url = require('url');

var RPCHandler = function(){
	var file="data.db";
	/*if(process.argv.length>=3){
		file=process.argv[2];
	}*/
	
	this.exp = new expensas.Expensas(file);
	
	this['/getCuentas'] = function(req,resp,query){
		this.exp.getCuentas(function(err,docs){
			console.log("get: "+JSON.stringify(docs));
			resp.writeHead(200, { 'Content-Type': 'application/json' });
			resp.end(JSON.stringify(docs),'utf-8');
		});
	}
	this['/addCuenta'] = function(req,resp,query){
		this.exp.agregarCuenta(query.nombre,function(err,newDocs){
			console.log("added: "+JSON.stringify(newDocs));
			resp.writeHead(200, { 'Content-Type': 'application/json' });
			resp.end(JSON.stringify(newDocs),'utf-8');
		});
	}
	this['/removeCuenta'] = function(req,resp,query){
		this.exp.eliminarCuenta(query.id,function(){
			resp.writeHead(200, { 'Content-Type': 'application/json' });
			resp.end();
		});
	}
	this['/getTotalCuenta'] = function(req,resp,query){
		this.exp.getTotalCuenta(query.id,function(err,total){
			console.log("total: "+total);
			resp.writeHead(200, { 'Content-Type': 'application/json' });
			resp.end(JSON.stringify({ total:total }));
		});
	}
	this['/getEntradas'] = function(req,resp,query){		
		this.exp.getEntradas(
				query.idCuenta,
				parseInt(query.offset),
				parseInt(query.size),function(docs){
			console.log("get: "+JSON.stringify(docs));
			resp.writeHead(200, { 'Content-Type': 'application/json' });
			resp.end(JSON.stringify(docs),"utf-8");	
		});
	}
	this['/countEntradas'] = function(req,resp,query){		
		this.exp.countEntradas(query.idCuenta,function(err,count){
			console.log("count: "+count);
			resp.writeHead(200, { 'Content-Type': 'application/json' });
			resp.end(JSON.stringify({ count:count }),"utf-8");	
		});
	}
	this['/addEntrada'] = function(req,resp,query){
		this.exp.agregarEntrada(
			query.idCuenta,query.desc,query.monto,function(err,newDocs){
			console.log("added: "+JSON.stringify(newDocs));
			resp.writeHead(200, { 'Content-Type': 'application/json' });
			resp.end(JSON.stringify(newDocs));	
		});
	}
	this['/removeEntrada'] = function(req,resp,query){
		this.exp.eliminarEntrada(query.id,function(){
			resp.writeHead(200, { 'Content-Type': 'application/json' });
			resp.end(JSON.stringify({ id:query.id }));
		});
	}
}

RPCHandler.prototype.handle = function(request,response){
	var parts = url.parse(request.url, true,true);
	if(this[parts.pathname]){
		this[parts.pathname](request,response,parts.query);
		return true;
	}
	return false;
}

var rpcHandler = new RPCHandler();

http.createServer(function (request, response) {
    console.log('request starting...');
	
	var root="./site"

	var filePath =  root + request.url;
	if (filePath == root+"/")
		filePath = root+'/index.html';		
	console.log(filePath);

	var extname = path.extname(filePath);
	
	//Handler if RPC
	if(rpcHandler.handle(request,response)){
		return;
	}

	//Handle normal request
	var contentType = 'text/html';
	switch (extname) {
		case '.js':
			contentType = 'text/javascript';
			break;
		case '.css':
			contentType = 'text/css';
			break;
		case '.png':
			contentType = 'image/png';
			break;
	}
	
	fs.exists(filePath, function(exists) {
	
		if (exists) {
			fs.readFile(filePath, function(error, content) {
				if (error) {
					response.writeHead(500);
					response.end();
				}
				else {
					response.writeHead(200, { 'Content-Type': contentType });
					response.end(content, 'utf-8');
				}
			});
		}
		else {
			response.writeHead(404);
			response.end();
		}
	});
	
}).listen(8000);

console.log('Server running at http://0.0.0.0:8000/');

