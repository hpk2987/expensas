const logger = require("./logger")
const path = require('path')
const fs = require('fs')
const exec = require('child_process').exec
const PDFDocument = require('pdfkit')
const Canvas = require('canvas')
const Image = Canvas.Image

class Convertidor {
	constructor(serviceRoot, secretKey, offsetsId, temporal) {
		this.conversionUtils = new ConversionUtils(serviceRoot, secretKey, offsetsId, temporal)
	}

	convertir(pdfs, done, expensas) {
		logger.info({ message: '=CONVERTIDOR= INCIANDO...' });

		// No hay nada que convertir
		if (pdfs.length == 0) {
			return;
		}

		const conversionUtils = this.conversionUtils;

		// Funete de datos de las imagenes de los PDFS
		var fuenteImagenes = {
			imagenes: [],
			hayMas: function () {
				return this.imagenes.length > 0;
			},
			obtener: function () {
				return this.imagenes.splice(0, 1)[0]
			},
			completado: function (imagenesHoja) {
				// Finalmente combinar todas las imagenes con forma
				// A4 en un PDF
				logger.info({ message: '=CONVERTIDOR= PASO 3 => HojasPNG a PDF' });
				conversionUtils.combinarImagenesEnPDF(imagenesHoja, function (filename) {
					logger.info({ message: '=CONVERTIDOR= FIN CONVERSION' });
					done(filename);
				})
			}
		}

		// Funete de datos de los PDFS
		let fuentePDFs = {
			archivos: [],
			hayMas: function () {
				return this.archivos.length > 0;
			},
			obtener: function () {
				return this.archivos.splice(0, 1)[0];
			},
			completado: function (imagenes) {
				// Ahora redimensionar las imagenes y
				// agruparlas de a 4 en otras imagenes 
				// con tamaño de // hoja A4
				logger.info({ message: '=CONVERTIDOR= PASO 2 => PNGs a HojasPNG' });
				fuenteImagenes.imagenes = imagenes;
				_this.conversionUtils.dibujarImagenesEnCanvasHojaA4(fuenteImagenes);
			}
		}
		fuentePDFs.archivos = pdfs;
		////////////////////////////////

		// Iniciar el proceso de conversion transformano cada PDF a una imagen
		logger.info({ message: '=CONVERTIDOR= PASO 1 => PDFs a PNGs' });
		conversionUtils.convertirPDFsaPNGs(fuentePDFs, expensas);
	}
}

/* =================================================================== */
/* =================================================================== */
/* Funciones core del conversor de PDF a la imagen agrupada PNG */
/* =================================================================== */7

class ConversionUtils {
	constructor(serviceRoot, secretKey, offsetsId, temporal) {
		this.secretKey = secretKey;
		this.offsetsId = offsetsId;
		this.serviceRoot = serviceRoot;
		this.temporal = temporal;

		this.offsetsBuffer = null;
	}

	obtenerOffsets = function (callback) {
		// PARA AJUSTAR OFFSETS SOLAMENTE
		fs.readFile("./offsets.json", function (err, data) {
			callback(JSON.parse(data));
		});
	}

	convertirPDFaPNG = function (infile,expensas, callback) {
		const baseInfile = path.basename(infile, path.extname(infile))
		const outfile = path.join(_this.temporal, baseInfile + ".png")
		const dpi = 300
		const cmd = "gs -dQUIET -dPARANOIDSAFER -dBATCH -dNOPAUSE -dNOPROMPT -sDEVICE=png16m -dTextAlphaBits=4 -dGraphicsAlphaBits=4 -r" + dpi + " -dFirstPage=1 -dLastPage=1 -sOutputFile=\"" + outfile + "\" \"" + infile + "\""

		console.log("=EXECUTE= " + cmd)
		exec(cmd, function (error, stdout, stderr) {
			if (error !== null) {
				throw (error);
			}

			// Asociar la imagen con un nombre de servicio si es posible
			expensas.obtenerDatosPDF(infile, function (resultado) {
				if (resultado.completo) {
					expensas.getServicio(resultado.datos.tipo, resultado.datos.cliente, function (servicio) {
						if (servicio) {
							console.log("=BINDING= " + servicio.nombre);
							callback({
								nombre: servicio.nombre,
								archivo: outfile
							});
						} else {
							console.log("=BINDING= FAILED!");
							console.log("=DEBUG= Resultado => " + JSON.stringify(resultado.datos));
							callback({
								archivo: outfile
							});
						}
					});
				} else {
					console.log("=BINDING= FAILED!");
					callback({
						archivo: outfile
					});
				}
			});
		});
	}

	procesarFuente(fuenteDatos, imagenes,expensas, callback) {
		if (fuenteDatos.hayMas()) {
			var pdf = fuenteDatos.obtener();
			convertirPDFaPNG(pdf, function (imagen) {
				imagenes.push(imagen);
				procesarFuente(fuenteDatos, imagenes);
			});
		} else {
			fuenteDatos.completado(imagenes);
		}
	}

	convertirPDFsaPNGs = function (fuenteDatos, expensas) {
		procesarFuente(fuenteDatos, []);
	}


}


}

/**
 * Toma hasta 4 imagenes de la fuente y las dibuja segun offsets dentro
 * de un canvas con el tamaño de una hoja A4
 */
ConversionUtils.prototype.dibujarImagenesEnCanvasHojaA4 = function (fuenteDatos) {
	var _this = this;

	var almacenarCanvasEnPNG = function (canvas, indicePagina, callback) {
		var filename = path.join(_this.temporal, 'agrupado_' + indicePagina + '.png');
		console.log("=STORE= Almacenando canvas de hoja en archivo => " + filename);

		var stream = canvas.createPNGStream();

		stream.pipe(fs.createWriteStream(filename))
			.on('finish', function () {
				callback(filename);
			})
			.on('error', function (err) {
				throw (err);
			});
	}

	// Dibuja una imagen dentro del canvas segun offsets
	var dibujarImagenEnCanvas = function (canvas, ctx, imagen, indice, callback) {
		_this.obtenerOffsets(function (offsets) {
			console.log("=DRAW= Dibujando imagen nombre => " + imagen.nombre + " en posicion => " + indice);

			var offsetData = offsets.find(function (e) {
				return e.servicios.indexOf(imagen.nombre) !== -1;
			});

			if (offsetData) {
				console.log("=BINDING= Utilizando offsets => " + offsetData.nombre + "  |  servicio => " + imagen.nombre);
				offsetData = offsetData.offsets;
			} else {
				console.log("=NO BINDING= Utilizando offsets  => " + offsets[0].nombre + "  |  servicio => " + imagen.nombre);
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

			ctx.font = off.text.font;
			ctx.fillText(imagen.nombre, off.text.x, off.text.y);

			callback();
		});
	}

	// El indiceHoja indica que elemento de la hoja es
	// Superior izquierdo 	== 0
	// Superior derecho 	== 1
	// Inferior izquierdo 	== 2
	// Inferior derecjo 	== 3
	var procesarFuenteHastaCompletarHoja = function (fuenteDatos, canvas, ctx, indiceHoja, callback) {
		if (fuenteDatos.hayMas() && indiceHoja < 4) {
			var imagen = fuenteDatos.obtener();
			fs.readFile(imagen.archivo, function (err, data) {
				var img = new Image();
				img.src = data;
				imagen.data = img;

				dibujarImagenEnCanvas(canvas, ctx, imagen, indiceHoja, function () {
					procesarFuenteHastaCompletarHoja(fuenteDatos, canvas, ctx, indiceHoja + 1, callback);
				});
			});
		} else {
			callback();
		}
	}

	// Procesa fuente con imagenes de PDF, los agrupa de a 4 en imagenes
	// tamaño hoja A4
	var procesarFuente = function (fuenteDatos, imagenesHoja, indicePagina) {
		if (fuenteDatos.hayMas()) {
			// Hoja A4
			var canvas = new Canvas(2479, 3508);
			var ctx = canvas.getContext('2d');
			ctx.clearRect(0, 0, canvas.width, canvas.height);
			console.log("=CONVERTIDOR= Creando pagina " + indicePagina)
			procesarFuenteHastaCompletarHoja(fuenteDatos, canvas, ctx, 0, function () {
				almacenarCanvasEnPNG(canvas, indicePagina, function (filename) {
					imagenesHoja.push(filename);
					procesarFuente(fuenteDatos, imagenesHoja, indicePagina + 1);
				});
			});
		} else {
			fuenteDatos.completado(imagenesHoja);
		}
	}

	procesarFuente(fuenteDatos, [], 0);
}

ConversionUtils.prototype.combinarImagenesEnPDF = function (imagenesHoja, callback) {
	var doc = new PDFDocument({ size: 'A4' });

	var pdfFilename = this.temporal + '/agrupado.pdf';
	doc.pipe(fs.createWriteStream(pdfFilename))
		.on('finish', function () {
			console.log("=STORE= Se creo el combinado PDF " + pdfFilename);
			callback(pdfFilename);
		});

	imagenesHoja.forEach(function (file, idx) {
		if (idx > 0) {
			doc.addPage({ size: 'A4' });
		}
		doc.image(file, 0, 0, { width: 600 });
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