const logger = require("./logger")
const { Expensas, AnalizadorPDF } = require("./expensas")
const async = require('async');
const path = require('path')
const fs = require('fs')
const exec = require('child_process').exec
const PDFDocument = require('pdfkit')
const { createCanvas, Image } = require('canvas')

/**
 * Utilitario para hacer mas simple el proceso de iteracion
 * de cada archivo que en si es una tarea asincronica
 */
class IteradorArchivos {
    constructor(archivos) {
        this.archivos = archivos
    }

    hayMas() {
        return this.archivos.length > 0
    }

    forEach(itemCB, done, batchSize) {
        var calls = [];
        while (this.archivos.length > 0) {
            var pdf = this.archivos.splice(0, 1)[0];
            calls.push(function (done) {
                itemCB(pdf, done)
            })

            if (batchSize && (batchSize <= calls.length)) {
                break;
            }
        }

        const _me = this
        async.series(calls, function (err, result) {
            if (err) {
	                logger.error({ message: "=CONVERTIDOR= EXCEPCION -> " + err.message })
            }
            done(result)
            if (_me.hayMas()) {
                _me.forEach(itemCB, done, batchSize)
            }
        })
    }
}

/**
 * Convierte un conjunto de documentos PDF (pagos)
 * en un solo documento PDF donde se pegan todos los
 * otros PDF pero reajustados de forma que entren
 * varios por hoja.
 * 
 * Este conversor se vale de un conversor de PDF a PNG
 * y luego de un canvas png para combinar y volver a PDF.
 * Este ultimo utiliza un archivo de configuracion que le dice
 * como reescalar y ubicar cada imagen en el documento final (offsets.json)
 */
class Conversor {
    constructor(temporal) {
        this.temporal = temporal
        this.analizadorPDF = new AnalizadorPDF();
    }

    /**
     * Agrupar conjunto de PDFs en un solo documento PDF
     * 
     * @param {*} pdfs Lista de nombre de archivos
     * @param {*} done Callback
     */
    convertir(pdfs, expensas, done) {
        logger.debug({ message: '=CONVERTIDOR= INCIANDO...' });

        // No hay nada que convertir
        if (pdfs.length == 0) {
            return;
        }

        // Iniciar el proceso de conversion transformano cada PDF a una imagen
        logger.debug({ message: '=CONVERTIDOR= PASO 1 => PDFs a PNGs' });
        this._convertirPDFsaPNGs(new IteradorArchivos(pdfs), expensas, done);
    }

    _convertirPDFsaPNGs(iteradorPDFs, expensas, done) {
        const _me = this;
        iteradorPDFs.forEach(function (pdf, done) {
            _me._convertirPDFaPNG(pdf, expensas, done)
        }, function (imagenes) {
            // Finalmente combinar todas las imagenes con forma
            // A4 en un PDF
            _me._dibujarImagenesEnCanvasHojaA4(new IteradorArchivos(imagenes), function (imagenesHoja) {
                _me._combinarImagenesEnPDF(imagenesHoja, function (agrupado) {
                    logger.debug({ message: '=CONVERTIDOR= FIN CONVERSION' })
                    done(agrupado)
                })
            })
        })
    }

    _convertirPDFaPNG(infile, expensas, done) {
        const baseInfile = path.basename(infile, path.extname(infile))
        const outfile = path.join(this.temporal, baseInfile + ".png")
        const dpi = 300
        const cmd = "gs -dQUIET -dPARANOIDSAFER -dBATCH -dNOPAUSE -dNOPROMPT -sDEVICE=png16m -dTextAlphaBits=4 -dGraphicsAlphaBits=4 -r" + dpi + " -dFirstPage=1 -dLastPage=1 -sOutputFile=\"" + outfile + "\" \"" + infile + "\""

        logger.debug({ message: "=EXECUTE= " + cmd })
        const _me = this;
        exec(cmd, function (error, stdout, stderr) {
            if (error !== null) {
                throw (error);
            }

            // Asociar la imagen con un nombre de servicio si es posible
            _me.analizadorPDF.obtenerDatosPDF(infile, function (resultado) {
                if (resultado.completo()) {
                    expensas.getServicio(resultado.datos.tipo, resultado.datos.cliente, function (err, servicio) {
                        if (err) {
                            done(err)
                        } else {
                            if (servicio) {
                                logger.debug({ message: "=BINDING= " + servicio.nombre });
                                done(null, {
                                    nombre: servicio.nombre,
                                    archivo: outfile
                                });
                            } else {
                                logger.debug({ message: "=BINDING= FAILED!" });
                                logger.debug({ message: "=DEBUG= Resultado => " + JSON.stringify(resultado.datos) });
                                done(null, {
                                    archivo: outfile
                                });
                            }
                        }
                    });
                } else {
                    logger.debug({ message: "=BINDING= FAILED!" });
                    done(null, {
                        archivo: outfile
                    });
                }
            });
        });
    }

    /**
	 * Toma hasta 4 imagenes de la fuente y las dibuja segun offsets dentro
     * de un canvas con el tamaño de una hoja A4
	 * 
	 * @param {*} iteradorImagenes 
	 */
    _dibujarImagenesEnCanvasHojaA4(iteradorImagenes, done, pngHojas) {
        if (!iteradorImagenes.hayMas()) {
            done(pngHojas)
            return
        }

        pngHojas = pngHojas ? pngHojas : []
        logger.debug({ message: "=CONVERTIDOR= Creando pagina " + (pngHojas.length/4) })
        
        const _me = this        

        let indiceHoja = 0
        // El indiceHoja indica que elemento de la hoja es
        // Superior izquierdo 	== 0
        // Superior derecho 	== 1
        // Inferior izquierdo 	== 2
        // Inferior derecjo 	== 3
        iteradorImagenes.forEach(function (imagen, done) {
            fs.readFile(imagen.archivo, function (err, data) {
                if (err) {
                    done(err)
                } else {
                    var img = new Image();
                    img.src = data;
                    imagen.data = img;

                    done(null, imagen);
                }
            });
        }, function (imagenes) {
            let canvas = createCanvas(2479, 3508);
            let ctx = canvas.getContext('2d');
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            imagenes.forEach((imagen, indiceHoja) => {
                _me._dibujarImagenEnCanvas(ctx, imagen, indiceHoja);
            })
            _me._almacenarCanvasEnPNG(canvas, indiceHoja, function (filename) {
                pngHojas.push(filename)
                _me._dibujarImagenesEnCanvasHojaA4(iteradorImagenes, done, pngHojas)
            })
        }, 4)
    }

    _almacenarCanvasEnPNG(canvas, indicePagina, done) {
        let filename = path.join(this.temporal, 'agrupado_' + indicePagina + '.png');
        logger.debug({ message: "=STORE= Almacenando canvas de hoja en archivo => " + filename });

        var stream = canvas.createPNGStream();

        stream.pipe(fs.createWriteStream(filename))
            .on('finish', function () {
                logger.debug({ message: "=STORE= Almacenado => " + filename });
                done(filename);
            })
            .on('error', function (err) {
                throw (err);
            });
    }

	/**
	 * Dibuja una imagen dentro del canvas segun offsets
	 * 
	 * @param {*} canvas 
	 * @param {*} ctx 
	 * @param {*} imagen 
	 * @param {*} indice
	 */
    _dibujarImagenEnCanvas(ctx, imagen, indice) {
        const offsets = JSON.parse(fs.readFileSync("./db/offsets.json"))

        logger.debug({ message: "=DRAW= Dibujando imagen nombre => " + imagen.nombre + " en posicion => " + indice });

        var offsetData = offsets.find(function (e) {
            return e.servicios.indexOf(imagen.nombre) !== -1;
        });

        if (offsetData) {
            logger.debug({ message: "=BINDING= Utilizando offsets => " + offsetData.nombre + "  |  servicio => " + imagen.nombre });
            offsetData = offsetData.offsets;
        } else {
            logger.debug({ message: "=NO BINDING= Utilizando offsets  => " + offsets[0].nombre + "  |  servicio => " + imagen.nombre });
            offsetData = offsets[0].offsets;
        }

        var off = offsetData[indice];
        logger.debug({ message: "=OFFSETS= " + JSON.stringify(off) });
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
    }

    _combinarImagenesEnPDF(imagenesHoja, done) {
        logger.info({ message: '=CONVERTIDOR= PASO 3 => HojasPNG a PDF' })

        var doc = new PDFDocument({ size: 'A4' });

        var pdfFilename = this.temporal + '/agrupado.pdf';
        doc.pipe(fs.createWriteStream(pdfFilename))
            .on('finish', function () {
                logger.debug({ message: "=STORE= Se creo el combinado PDF " + pdfFilename });
                done(pdfFilename);
            });

        imagenesHoja.forEach(function (file, idx) {
            if (idx > 0) {
                doc.addPage({ size: 'A4' });
            }
            doc.image(file, 0, 0, { width: 600 });
        });
        doc.end();
    }
}

module.exports = Conversor;

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
