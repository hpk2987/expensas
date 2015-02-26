var fs=require('fs');
var exec = require('child_process').exec;
var PDFDocument = require('pdfkit');
var Canvas = require('canvas')
var Image = Canvas.Image;

var Convertidor= function(){
}

exports.Convertidor = Convertidor;

Convertidor.prototype.convertir = function(pdfs,temporal,callback){
	var canvas = new Canvas(2479,3508)

	var convertirPDF = function(pdfs,idx,imagenes){
		var infile = pdfs.splice(0,1)[0];
		var outfile = temporal+"/pdfapng_"+idx+".png";
		var dpi=300;
		var cmd = "gs -dQUIET -dPARANOIDSAFER -dBATCH -dNOPAUSE -dNOPROMPT -sDEVICE=png16m -dTextAlphaBits=4 -dGraphicsAlphaBits=4 -r"+dpi+" -dFirstPage=1 -dLastPage=1 -sOutputFile=\""+outfile+"\" \""+infile+"\"";
		exec(cmd, function (error, stdout, stderr) {
			if ( error !== null ) {
				throw(error);
			}else{
				imagenes.push(outfile);
				if(pdfs.length>0){
					convertirPDF(pdfs,idx+1,imagenes);
				}else{
					var ctx = canvas.getContext('2d');
					procesarImagen(imagenes,[],[],ctx);
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
		var offsets = JSON.parse(fs.readFileSync("offsets.json"));

		stack.forEach(function(o,idx){
			off = offsets[idx];
			ctx.drawImage(o, 
				off.sx,
				off.sy,
				off.sWidth,
				off.sHeight,
				off.dx,
				off.dy,
				off.dWidth,
				off.dHeight);
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
		fs.readFile(imagen, function(err, data) {
			var img = new Image();
			img.src = data;
			stack.push(img);

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
var conv = new Convertidor();

/*var pdf="./carga_test/t1.pdf";
conv.convertir(
	[pdf,pdf,pdf,pdf],
	"./files",
	function(filename){
		console.log(filename);
	});*/
