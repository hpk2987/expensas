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
		this.exp.getCuentas(function(docs){
			resp.writeHead(200, { 'Content-Type': 'application/json' });
			resp.end(JSON.stringify(docs),'utf-8');
		});
	}
	this['/addCuenta'] = function(req,resp,query){
		this.exp.agregarCuenta(query.nombre);
		resp.writeHead(200, { 'Content-Type': 'application/json' });
		resp.end();		
	}
	this['/addEntrada'] = function(req,resp,query){
		var expin=this.exp;
		this.exp.getCuenta(query.nombre,function(doc){
			doc[0].push({descripcion:query.desc,monto:})
			expin.actualizarCuenta(doc[0]);
		});
		resp.writeHead(200, { 'Content-Type': 'application/json' });
		resp.end();		
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
	
	var filePath = '.' + request.url;
	if (filePath == './')
		filePath = './index.html';
		
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

