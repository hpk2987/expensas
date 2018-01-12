var fs=require('fs');
var request = require('request');
var exec = require('child_process').exec;
var PDFDocument = require('pdfkit');
var Canvas = require('canvas')
var Image = Canvas.Image;

var Convertidor= function(){
}

var Convertidor = function(serviceRoot,secretKey,offsetsId){
	console.log("=== Valores de offsets ===");
	console.log("secretKey	=> " + secretKey);
	console.log("offsetsId 	=> " + offsetsId);

	this.secretKey = secretKey;
	this.offsetsId = offsetsId;
	this.serviceRoot = serviceRoot;
}

exports.Convertidor = Convertidor;

Convertidor.prototype.convertir = function(pdfs,temporal,callback,expensas){
	var canvas = new Canvas(2479,3508)

	var _this = this;
	var getOffsets = function(callback){
		var options = {
			url: _this.serviceRoot+_this.offsetsId,
			method: "GET",
			headers:{
				'secret-key': _this.secretKey
			}
		};

		console.log("=GET= " + _this.serviceRoot+_this.offsetsId+"/latest");
		request(options,function(error,response,body){
			console.log("=RESPUESTA GET= "  + body);
			if(error!=null){
				console.error(error);
			}else{
				callback(JSON.parse(body));
			}
		});
	}

	var getPDFData = function(file,callback){
		console.log("=INFO= Convirtiendo PDF " + file);
		expensas.obtenerDatosPDF(file,function(resultado){			
			expensas.getServicio(resultado.datos.tipo,resultado.datos.cliente,function(servicio){								
				if(servicio){
					console.log("=BINDING= " + servicio.nombre);
					callback(servicio.nombre);
				}else{
					console.log("=BINDING= FAILED!");
					callback("");
				}
			});
		});
	}

	var convertirPDF = function(pdfs,idx,imagenes){
		var infile = pdfs.splice(0,1)[0];
		var outfile = temporal+"/pdfapng_"+idx+".png";
		var dpi=300;
		var cmd = "gs -dQUIET -dPARANOIDSAFER -dBATCH -dNOPAUSE -dNOPROMPT -sDEVICE=png16m -dTextAlphaBits=4 -dGraphicsAlphaBits=4 -r"+dpi+" -dFirstPage=1 -dLastPage=1 -sOutputFile=\""+outfile+"\" \""+infile+"\"";
		exec(cmd, function (error, stdout, stderr) {
			if ( error !== null ) {
				throw(error);
			}else{				
				if(pdfs.length>0){
					getPDFData(infile,function(nombre){
						imagenes.push({
							nombre:nombre,
							archivo:outfile
						});
						convertirPDF(pdfs,idx+1,imagenes);
					});
				}else{
					getPDFData(infile,function(nombre){
						imagenes.push({
							nombre:nombre,
							archivo:outfile
						});
						var ctx = canvas.getContext('2d');
						procesarImagen(imagenes,[],[],ctx);
					});
				}
			}
		});
	}
	convertirPDF(pdfs,0,[]);

	var crearPDF = function(groups,callback){
		// Crear pdf con todo junto
		doc = new PDFDocument({size: 'A4'});		

		var pdfFilename = temporal+'/agrupado.pdf';
		doc.pipe(fs.createWriteStream(pdfFilename))
			.on('finish',function(){
				callback(pdfFilename);	
			});

		groups.forEach(function(file,idx){			
			if(idx>0){
				doc.addPage({size: 'A4'});
			}
			doc.image(file, 0, 0,{width:600});
		});
		doc.end();
	}

	var dibujar = function(ctx,stack){
		getOffsets(function(offsets){
			ctx.clearRect ( 0 , 0 , canvas.width, canvas.height );
			stack.forEach(function(o,idx){

				offsetData = offsets.find(function(e){
					return (e.servicios.find(function(w){ return w===o.nombe; }) !== null);
				});

				if(offsetData==null){
					offsetData = offsets[0].offsets;
				}else{
					offsetData = offsetData.offsets;
				}

				off = offsetData[idx];
				ctx.drawImage(o.data,
					off.sx,
					off.sy,
					off.sWidth,
					off.sHeight,
					off.dx,
					off.dy,
					off.dWidth,
					off.dHeight);

				ctx.font=off.text.font;
				ctx.fillText(o.nombre, off.text.x,off.text.y);
			});
		});
    }

    var guardar = function(ctx,group,callback){
    	var filename=temporal+'/agrupado_'+group+'.png';
    	var stream = canvas.createPNGStream();
		
		stream.pipe(fs.createWriteStream(filename))
			.on('finish',function(){
				callback(filename);	
			})
			.on('error', function(err){
				throw (err);
			});
    }

	var procesarImagen = function(imagenes,stack,groups,ctx){
		var imagen = imagenes.splice(0,1)[0];
		fs.readFile(imagen.archivo, function(err, data) {
			var img = new Image();
			img.src = data;
			stack.push({
				data:img,
				nombre:imagen.nombre
			});

			if(stack.length<4 && imagenes.length >0){
				procesarImagen(imagenes,stack,groups,ctx);
			}else{
				dibujar(ctx,stack);
				stack = [];

				guardar(ctx,groups.length,function(filename){
					groups.push(filename);

					if(imagenes.length>0){
						procesarImagen(imagenes,stack,groups,ctx);
					}else{
						// Quedo un remanente
						if(stack.length>0){
							dibujar(ctx,stack);
							stack = [];
							guardar(ctx,groups.length,function(filename){
								groups.push(filename);
								crearPDF(groups,function(filename){
									callback(filename);
								});
							});
						}else{
							crearPDF(groups,function(filename){
								callback(filename);
							});
						}
					}
				});
			}
		});
	}
}

// TESTING =>
/*var Expensas = require('./expensas');
var expensas = new Expensas.Expensas("data.db");
var conv = new Convertidor();

var pdf="./carga_test/test.pdf";
conv.convertir(
	[pdf,pdf,pdf,pdf],
	"./files",
	function(filename){
		console.log(filename);
	},expensas);
*/