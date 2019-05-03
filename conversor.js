const logger = require("./logger")
const async = require('async');
const path = require('path')
const fs = require('fs')
const exec = require('child_process').exec
const PDFDocument = require('pdfkit')
const Canvas = require('canvas')
const Image = Canvas.Image

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
        while (this.archivos.length > 0 && batchSize && batchSize > calls.length) {
            var pdf = this.archivos.splice(0, 1)[0];
            calls.push(function (done) {
                itemCB(pdf, done)
            })
        }

        async.parallel(calls, function (err, result) {
            if (err) {
                logger.error({ message: "=CONVERTIDOR= EXCEPCION -> " + err })
            }
            done(result)
            if (hayMas()) {
                forEach(itemCB, done, batchSize)
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
    }

    /**
     * Agrupar conjunto de PDFs en un solo documento PDF
     * 
     * @param {*} pdfs Lista de nombre de archivos
     * @param {*} done Callback
     * @param {*} expensas Objeto expensas
     */
    convertir(pdfs, done, expensas) {
        logger.info({ message: '=CONVERTIDOR= INCIANDO...' });

        // No hay nada que convertir
        if (pdfs.length == 0) {
            return;
        }

        // Iniciar el proceso de conversion transformano cada PDF a una imagen
        logger.info({ message: '=CONVERTIDOR= PASO 1 => PDFs a PNGs' });
        convertirPDFsaPNGs(new IteradorArchivos(pdfs), expensas, done);
    }

    _convertirPDFsaPNGs(iteradorPDFs, expensas, done) {
        iteradorPDFs.forEach(function (pdf, done) {
            _convertirPDFaPNG(pdf, expensas, done)
        }, function (imagenes) {
            // Finalmente combinar todas las imagenes con forma
            // A4 en un PDF
            _dibujarImagenesEnCanvasHojaA4(new IteradorArchivos(imagenes), function (imagenesHoja) {
                _combinarImagenesEnPDF(imagenesHoja, function (agrupado) {
                    logger.info({ message: '=CONVERTIDOR= FIN CONVERSION' })
                    done(agrupado)
                })
            })
        })
    }

    _convertirPDFaPNG(infile, expensas, done) {
        const baseInfile = path.basename(infile, path.extname(infile))
        const outfile = path.join(_this.temporal, baseInfile + ".png")
        const dpi = 300
        const cmd = "gs -dQUIET -dPARANOIDSAFER -dBATCH -dNOPAUSE -dNOPROMPT -sDEVICE=png16m -dTextAlphaBits=4 -dGraphicsAlphaBits=4 -r" + dpi + " -dFirstPage=1 -dLastPage=1 -sOutputFile=\"" + outfile + "\" \"" + infile + "\""

        logger.info({ message: "=EXECUTE= " + cmd })
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
                            done({
                                nombre: servicio.nombre,
                                archivo: outfile
                            });
                        } else {
                            logger.info({ message: "=BINDING= FAILED!" });
                            logger.info({ message: "=DEBUG= Resultado => " + JSON.stringify(resultado.datos) });
                            done({
                                archivo: outfile
                            });
                        }
                    });
                } else {
                    logger.info({ message: "=BINDING= FAILED!" });
                    done({
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
    _dibujarImagenesEnCanvasHojaA4(iteradorImagenes, done) {
        let pngHojas = []

        while (iteradorImagenes.hayMas()) {
            let indiceHoja = 0
            // El indiceHoja indica que elemento de la hoja es
            // Superior izquierdo 	== 0
            // Superior derecho 	== 1
            // Inferior izquierdo 	== 2
            // Inferior derecjo 	== 3
            iteradorImagenes.forEach(function (imagen, done) {
                fs.readFile(imagen.archivo, function (err, data) {
                    var img = new Image();
                    img.src = data;
                    imagen.data = img;

                    done(imagen);
                });
            }, function (imagenes) {
                logger.info({ message: "=CONVERTIDOR= Creando pagina " + indiceHoja })

                let canvas = new Canvas(2479, 3508);
                let ctx = canvas.getContext('2d');
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                imagenes.forEach(imagen, indiceHoja => {
                    _dibujarImagenesEnCanvas(ctx, imagen, indiceHoja);
                })
                _almacenarCanvasEnPNG(canvas, indiceHoja, function (filename) {
                    pngHojas.push(filename)
                    if (!iteradorImagenes.hayMas) {
                        done(pngHojas)
                    }
                })
            }, 4)
        }
    }

    _almacenarCanvasEnPNG(canvas, indicePagina, done) {
        let filename = path.join(_this.temporal, 'agrupado_' + indicePagina + '.png');
        logger.info({ message: "=STORE= Almacenando canvas de hoja en archivo => " + filename });

        var stream = canvas.createPNGStream();

        stream.pipe(fs.createWriteStream(filename))
            .on('finish', function () {
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

        logger.info({ message: "=DRAW= Dibujando imagen nombre => " + imagen.nombre + " en posicion => " + indice });

        var offsetData = offsets.find(function (e) {
            return e.servicios.indexOf(imagen.nombre) !== -1;
        });

        if (offsetData) {
            logger.info({ message: "=BINDING= Utilizando offsets => " + offsetData.nombre + "  |  servicio => " + imagen.nombre });
            offsetData = offsetData.offsets;
        } else {
            logger.info({ message: "=NO BINDING= Utilizando offsets  => " + offsets[0].nombre + "  |  servicio => " + imagen.nombre });
            offsetData = offsets[0].offsets;
        }

        var off = offsetData[indice];
        logger.info({ message: "=OFFSETS= " + JSON.stringify(off) });
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
                logger.info({ message: "=STORE= Se creo el combinado PDF " + pdfFilename });
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

exports.Conversor = Conversor;

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