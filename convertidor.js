var path = require('path');
var fs=require('fs');
var request = require('request');
var exec = require('child_process').exec;
var PDFDocument = require('pdfkit');
var Canvas = require('canvas');
var shortid = require('shortid');
var Image = Canvas.Image;

var Convertidor= function(){
}

var Convertidor = function(serviceRoot,secretKey,offsetsId,temporal){
	this.conversionUtils = new ConversionUtils(serviceRoot,secretKey,offsetsId,temporal);
}

exports.Convertidor = Convertidor;

Convertidor.prototype.convertir = function(pdfs,callback,expensas){
	console.log('=CONVERTIDOR= INCIANDO...');

	// No hay nada que convertir
	if(pdfs.length==0){
		return;
	}

	var _this = this;

	// Funete de datos de las imagenes de los PDFS
	var fuenteImagenes = {
		imagenes : [],
		hayMas : function(){
			return this.imagenes.length > 0;
		},
		obtener : function(){
			return this.imagenes.splice(0,1)[0];
		},
		completado : function(imagenesHoja){
			// Finalmente combinar todas las imagenes con forma
			// A4 en un PDF
			console.log('=CONVERTIDOR= PASO 3 => HojasPNG a PDF');
			_this.conversionUtils.combinarImagenesEnPDF(imagenesHoja,function(filename){
				console.log('=CONVERTIDOR= FIN CONVERSION');
				callback(filename);
			});
		}
	};

	// Funete de datos de los PDFS
	var fuentePDFs = {
		archivos : [],
		hayMas:  function(){
			return this.archivos.length > 0;
		},
		obtener : function(){
			return this.archivos.splice(0,1)[0];
		},
		completado : function(imagenes){
			// Ahora redimensionar las imagenes y
			// agruparlas de a 4 en otras imagenes 
			// con tamaño de // hoja A4
			console.log('=CONVERTIDOR= PASO 2 => PNGs a HojasPNG');
			fuenteImagenes.imagenes = imagenes;
			_this.conversionUtils.dibujarImagenesEnCanvasHojaA4(fuenteImagenes);
		}
	}
	fuentePDFs.archivos = pdfs;
	////////////////////////////////

	// Iniciar el proceso de conversion transformano cada PDF a una imagen
	console.log('=CONVERTIDOR= PASO 1 => PDFs a PNGs');
	this.conversionUtils.convertirPDFsaPNGs(fuentePDFs,expensas);
}

/* =================================================================== */
/* =================================================================== */
/* Funciones core del conversor de PDF a la imagen agrupada PNG */
/* =================================================================== */7

var ConversionUtils = function(serviceRoot,secretKey,offsetsId,temporal){
	this.secretKey = secretKey;
	this.offsetsId = offsetsId;
	this.serviceRoot = serviceRoot;
	this.temporal = temporal;

	this.offsetsBuffer = null;
}

ConversionUtils.prototype.obtenerOffsets = function(callback){
	// PARA AJUSTAR OFFSETS SOLAMENTE
	if(process.env.EXPENSAS_MODO==="DEBUG"){
		fs.readFile("./offsets.json", function(err, data){
			callback(JSON.parse(data));
		});
		
	}else{
		if(this.offsetsBuffer !== null){
			callback(this.offsetsBuffer);
			return;
		}

		var options = {
			url: this.serviceRoot+this.offsetsId+"/latest",
			method: "GET",
			headers:{
				'secret-key': this.secretKey,
				'content-type': 'application/json'
			}
		};

		console.log("=GET= " + options.url);
		var _this=this;
		request(options,function(error,response,body){
			console.log("=RESPUESTA GET= "  + body);
			if(error!=null){
				console.error(error);
			}else{
				_this.offsetsBuffer = JSON.parse(body);
				callback(_this.offsetsBuffer);
			}
		});
	}
}

ConversionUtils.prototype.convertirPDFsaPNGs = function(fuenteDatos,expensas){
	var _this = this;

	var convertirPDFaPNG = function(infile,callback){
		var baseInfile = path.basename(infile, path.extname(infile));
		var outfile = path.join(_this.temporal,baseInfile+".png");
		var dpi=300;
		var cmd = "gs -dQUIET -dPARANOIDSAFER -dBATCH -dNOPAUSE -dNOPROMPT -sDEVICE=png16m -dTextAlphaBits=4 -dGraphicsAlphaBits=4 -r"+dpi+" -dFirstPage=1 -dLastPage=1 -sOutputFile=\""+outfile+"\" \""+infile+"\"";
		
		console.log("=EXECUTE= " + cmd);
		exec(cmd, function (error, stdout, stderr) {
			if ( error !== null ) {
				throw(error);
			}

			// Asociar la imagen con un nombre de servicio si es posible
			expensas.obtenerDatosPDF(infile,function(resultado){
				var imagen = {
					archivo:outfile
				};
				
				if(resultado.completo){
					expensas.getServicio(resultado.datos.tipo,resultado.datos.cliente,function(servicio){								
						if(servicio){
							console.log("=BINDING= " + servicio.nombre);
							callback({
								nombre: servicio.nombre,
								archivo:outfile
							});
						}else{
							console.log("=BINDING= FAILED!");
							console.log("=DEBUG= Resultado => " + JSON.stringify(resultado.datos));
							callback({
								archivo:outfile
							});		
						}
					});
				}else{
					console.log("=BINDING= FAILED!");
					callback({
						archivo:outfile
					});
				}
			});
		});
	}

	var procesarFuente = function(fuenteDatos,imagenes,callback){
		if(fuenteDatos.hayMas()){
			var pdf = fuenteDatos.obtener();
			convertirPDFaPNG(pdf,function(imagen){
				imagenes.push(imagen);
				procesarFuente(fuenteDatos,imagenes);
			});
		}else{
			fuenteDatos.completado(imagenes);
		}
	}

	procesarFuente(fuenteDatos,[]);
}

/**
 * Toma hasta 4 imagenes de la fuente y las dibuja segun offsets dentro
 * de un canvas con el tamaño de una hoja A4
 */
ConversionUtils.prototype.dibujarImagenesEnCanvasHojaA4 = function(fuenteDatos){	
	var _this = this;

	var almacenarCanvasEnPNG = function(canvas,indicePagina,callback){		
		var filename= path.join(_this.temporal,'agrupado_'+indicePagina+'.png');
		console.log("=STORE= Almacenando canvas de hoja en archivo => " + filename);

    	var stream = canvas.createPNGStream();
		
		stream.pipe(fs.createWriteStream(filename))
		.on('finish',function(){
			callback(filename);	
		})
		.on('error', function(err){
			throw (err);
		});
	}

	// Dibuja una imagen dentro del canvas segun offsets
	var dibujarImagenEnCanvas = function(canvas,ctx,imagen,indice,callback){
		_this.obtenerOffsets(function(offsets){
			console.log("=DRAW= Dibujando imagen nombre => " + imagen.nombre + " en posicion => " + indice );
			
			var offsetData = offsets.find(function(e){
				return e.servicios.indexOf(imagen.nombre)!==-1;
			});
			
			if(offsetData){
				console.log("=BINDING= Utilizando offsets => " + offsetData.nombre  +"  |  servicio => " + imagen.nombre);
				offsetData = offsetData.offsets;
			}else{
				console.log("=NO BINDING= Utilizando offsets  => " + offsets[0].nombre  +"  |  servicio => " + imagen.nombre);				
				offsetData = offsets[0].offsets;
			}			

			var off = offsetData[indice];
			console.log("=OFFSETS= " + JSON.stringify(off));
			ctx.drawImage(imagen.data,
				off.sx,
				off.sy,
				off.sWidth,
				off.sHeight,
				off.dx,
				off.dy,
				off.dWidth,
				off.dHeight);

			ctx.font=off.text.font;
			ctx.fillText(imagen.nombre, off.text.x,off.text.y);

			callback();
		});
	}

	// El indiceHoja indica que elemento de la hoja es
	// Superior izquierdo 	== 0
	// Superior derecho 	== 1
	// Inferior izquierdo 	== 2
	// Inferior derecjo 	== 3
	var procesarFuenteHastaCompletarHoja = function(fuenteDatos,canvas,ctx,indiceHoja,callback){
		if(fuenteDatos.hayMas() && indiceHoja<4){
			var imagen = fuenteDatos.obtener();
			fs.readFile(imagen.archivo, function(err, data) {
				var img = new Image();
				img.src = data;
				imagen.data = img;

				dibujarImagenEnCanvas(canvas,ctx,imagen,indiceHoja,function(){
					procesarFuenteHastaCompletarHoja(fuenteDatos,canvas,ctx,indiceHoja+1,callback);
				});
			});
		}else{
			callback();
		}
	}

	// Procesa fuente con imagenes de PDF, los agrupa de a 4 en imagenes
	// tamaño hoja A4
	var procesarFuente = function(fuenteDatos,imagenesHoja,indicePagina){
		if(fuenteDatos.hayMas()){
			// Hoja A4
			var canvas = new Canvas(2479,3508);
			var ctx = canvas.getContext('2d');
			ctx.clearRect ( 0 , 0 , canvas.width, canvas.height );
			console.log("=CONVERTIDOR= Creando pagina " + indicePagina)
			procesarFuenteHastaCompletarHoja(fuenteDatos,canvas,ctx,0,function(){
				almacenarCanvasEnPNG(canvas,indicePagina,function(filename){
					imagenesHoja.push(filename);
					procesarFuente(fuenteDatos,imagenesHoja,indicePagina+1);
				});				
			});
		}else{
			fuenteDatos.completado(imagenesHoja);
		}
	}

	procesarFuente(fuenteDatos,[],0);
}

ConversionUtils.prototype.combinarImagenesEnPDF = function(imagenesHoja,callback){
	var doc = new PDFDocument({size: 'A4'});

	var pdfFilename = this.temporal+'/agrupado.pdf';
	doc.pipe(fs.createWriteStream(pdfFilename))
	.on('finish',function(){
		console.log("=STORE= Se creo el combinado PDF " + pdfFilename);
		callback(pdfFilename);	
	});

	imagenesHoja.forEach(function(file,idx){			
		if(idx>0){
			doc.addPage({size: 'A4'});
		}
		doc.image(file, 0, 0,{width:600});
	});
	doc.end();
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