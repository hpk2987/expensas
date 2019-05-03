const logger = require("./logger")
const Datastore = require('nedb');
const moment = require('moment');
const PDFParser = require("pdf2json");

class Expensas {
    constructor(dbname, inMemory) {
        const file = "./db/" + dbname + ".json"
        const file2 = "./db/entradas." + dbname + ".json"
        const file3 = "./db/servicios." + dbname + ".json"

        this.db = {}
        if (inMemory) {
            this.db.cuentas = new Datastore({ inMemoryOnly: true })
            this.db.entradas = new Datastore({ inMemoryOnly: true })
            this.db.servicios = new Datastore({ inMemoryOnly: true })
        } else {
            this.db.cuentas = new Datastore({ filename: file, autoload: true })
            logger.debug({ message: "Cuentas DB : " + file })
            this.db.entradas = new Datastore({ filename: file2, autoload: true })
            logger.debug({ message: "Entradas DB : " + file2 })
            this.db.servicios = new Datastore({ filename: file3, autoload: true })
            logger.debug({ message: "Servicios DB : " + file3 })
        }
    }

    getEntradasDeCuenta(idCuenta, offset, size, done) {
        logger.debug({ message: "Entradas de:" + idCuenta + " | offset:" + offset + " | size:" + size })
        this.db.entradas.find({ cuenta: idCuenta })
            .sort({ secs: -1 })
            .skip(offset)
            .limit(size).exec(function (err, docs) {
                if (err) {
                    done(err)
                } else {
                    logger.debug({ message: "Entradas obtenidas:" + docs.length })
                    done(err, docs)
                }
            })
    }

    agregarEntrada(idCuenta, descripcion, monto, done) {
        let entrada = {
            cuenta: idCuenta,
            descripcion: descripcion,
            monto: parseFloat(monto),
            fecha: moment().format('DD/MM/YYYY'),
            secs: new Date().getTime()
        };
        logger.debug({ message: "Agregando entrada:" + JSON.stringify(entrada) });
        this.db.entradas.insert(entrada, done)
    }

    eliminarEntrada(idEntrada, done) {
        logger.debug({ message: "Eliminando entrada: " + idEntrada })
        this.db.entradas.remove({ _id: idEntrada }, {}, done)
    }

    getCuentas(done) {
        this.db.cuentas.find({}).exec(done)
    }

    agregarCuenta(nombre, done) {
        var cuenta = { nombre: nombre }
        logger.debug({ message: "Agregando cuenta nombre:" + JSON.stringify(cuenta) })
        this.db.cuentas.insert(cuenta, done)
    }

    eliminarCuenta(idCuenta, done) {
        logger.debug({ message: "Eliminando cuenta :" + idCuenta })
        this.db.cuentas.remove({ _id: idCuenta }, {}, done);
    }

    getCuenta(id, done) {
        this.db.cuentas.find({ _id: id }, done)
    }

    getTotalCuenta(idCuenta, done) {
        this.db.entradas.find({ cuenta: idCuenta }, function (err, docs) {
            if (err) {
                done(err)
            } else {
                var total = 0
                for (var i = 0; i < docs.length; i++) {
                    total += parseInt((docs[i].monto * 10).toString())
                }
                done(err, total / 10)
            }
        });
    }

    getEntradasHoy(idCuenta, done) {
        let hoy = new Date()
        hoy.setHours(0, 0, 0, 0)

        logger.debug({ message: "Entradas de hoy de:" + idCuenta })
        this.db.entradas.find({ cuenta: idCuenta, secs: { $gt: hoy.getTime() } })
            .sort({ secs: -1 })
            .exec(function (err, docs) {
                if (err) {
                    done(err)
                } else {
                    logger.debug({ message: "Entradas obtenidas:" + docs.length })
                    done(err, docs)
                }
            })
    }


    getResumenHoy(done) {
        let resumen = {
            cuentas: [],
            fecha: moment().format('DD/MM/YYYY')
        }

        const _me = this;
        this.getCuentas(function (err, docs) {
            let funcs = [];
            docs.forEach(function (cuenta) {
                funcs.push(function () {
                    _me.getEntradasHoy(cuenta._id, function (err, docs) {
                        if (docs.length > 0) {
                            //Calcular total
                            let total = 0
                            for (let i = 0; i < docs.length; i++) {
                                total += parseInt((docs[i].monto * 10).toString())
                            }

                            resumen.cuentas.push({
                                cuenta: cuenta.nombre,
                                entradas: docs,
                                total: total / 10
                            })
                        }

                        if (funcs.length > 0) {
                            funcs.splice(0, 1)[0]()
                        } else {
                            done(resumen)
                        }
                    });
                });
            });
            if (funcs.length > 0) {
                funcs.splice(0, 1)[0]()
            }
        });
    }

    countEntradas(idCuenta, done) {
        this.db.entradas.count({ cuenta: idCuenta }, done)
    }

    getServicios(done) {
        this.db.servicios.find({}).exec(function (err, docs) {
            if (err) {
                done(err)
            } else {
                logger.debug({ message: "Servicios obtenidas:" + docs.length })
                done(err, docs)
            }
        });
    }

    getServicio(tipo, cliente, done) {
        let servicio = {
            tipo: tipo,
            cliente: cliente
        };

        this.db.servicios.find(servicio, function (err, docs) {
            if (docs.length > 0) {
                done(err,docs[0])
            } else {
                done()
            }
        });
    }

    eliminarServicio(idServicio, done) {
        logger.debug({ message: "Eliminando servicio :" + idServicio })
        this.db.servicios.remove({ _id: idServicio }, {}, done)
    }

    agregarServicio(cuenta, tipo, cliente, nombre, done) {
        let servicio = {
            cuenta: cuenta,
            tipo: tipo,
            cliente: cliente,
            nombre: nombre
        };

        logger.info({ message: "Intentando agregar: " + JSON.stringify(servicio) })
        this.db.servicios.update(servicio, servicio, { upsert: true }, function (err, numReplaced, docs) {
            if (err) {
                done(err)
            } else {
                logger.debug({ message: "Agregando servicio:" + JSON.stringify(docs) })
                done(docs)
            }
        });
    }

    /* =================================================================== */
    /* =================================================================== */
    /* PDF ops */
    /* =================================================================== */


}

/**
 * Resultados de parseo de un PDF
 * 
 */
class ResultadoParserPDF {
    constructor(archivo, extra) {
        this.datos = []
        this.archivo = archivo
        this.extra = extra
    }

    completo() {
        return (this.datos.tipo != null && this.datos.cliente != null && this.datos.importe != null)
    }

    esTipo(valor) {
        return valor.match(/^PAGO DE/i) !== null ||
            valor.match(/^abonado/i) !== null ||
            valor.match(/^Descripción Pago/i) !== null
    }

    esCliente(valor) {
        return (valor.match(/^NRO.[ ]?DE CLIENTE/i) !== null) ||
            (valor.match(/^CUIT[ ]*CONTRIBUYENTE/i) !== null)
    }

    esImporte(valor) {
        return valor.match(/^IMPORTE:/i) !== null ||
            valor.match(/IMPORTE$/i) !== null
    }

    cargarTipo(valor) {
        if (valor.match(/ - Comprobante$/)) {
            valor = valor.replace(/ - Comprobante$/, "")
        }

        if (valor.match(/^PAGO DE/i) !== null) {
            this.datos.tipo = valor.substr(8).trim()
        }

        if (valor.match(/^abonado/i) !== null) {
            this.datos.tipo = valor.substr(9).trim()
        }

        if (valor.match(/^Descripción Pago/i) !== null) {
            this.datos.tipo = valor.substr(17).trim()
        }
    }

    cargarImporte(valor) {
        if (valor.match(/^IMPORTE:/i) !== null) {
            this.datos.importe = parseFloat(valor.substr(valor.indexOf(':') + 3).replace(',', '.'))
        }

        if (valor.match(/IMPORTE$/i) !== null) {
            this.datos.importe = parseFloat(valor.replace(/IMPORTE$/i, '').trim().replace(',', '.'))
        }
    }

    cargarCliente(valor) {
        if ((valor.match(/^NRO.[ ]?DE CLIENTE/i) !== null) ||
            (valor.match(/^CUIT[ ]*CONTRIBUYENTE/i) !== null)) {

            if (valor.indexOf(':') !== -1) {
                this.datos.cliente = valor.substr(valor.indexOf(':') + 2)
            } else {
                this.datos.cliente = valor.substr(19)
            }
        }
    }
}

class AnalizadorPDF {
    constructor() {
    }

    obtenerDatosPDF(archivo, done, extra) {
        let pdfParser = new PDFParser()
        let resultado = new ResultadoParserPDF(archivo, extra)

        pdfParser.on("pdfParser_dataError", errData => console.error(errData.parserError))

        pdfParser.on("pdfParser_dataReady", pdfData => {
            // Son comprobantes siempre tienen una sola pagina
            let textos = pdfData.formImage.Pages[0].Texts

            const beVerbose = process.env.VERBOSE

            if (beVerbose) {
                logger.debug({ message: "=DEBUG= Full pdf text parse" })
                logger.debug({ message: "=DEBUG=" + JSON.stringify(textos) })
            }

            // Agrupar como lineas textos con la misma coordenada "y"
            let agrupados = {}
            for (let i = 0; i < textos.length; i++) {
                let coordenadaY = Math.floor(textos[i].y)
                if (agrupados[coordenadaY.toString()] === undefined) {
                    agrupados[coordenadaY.toString()] = { texto: "" }
                }

                agrupados[coordenadaY.toString()].texto += decodeURIComponent(textos[i].R[0].T) + " "
            }

            for (let key in agrupados) {
                let texto = agrupados[key].texto.trim()

                if (beVerbose) {
                    logger.debug({ message: "=DEBUG= Texto=" + texto })
                    logger.debug({ message: "=DEBUG= Linea Y=" + key })
                    logger.debug({ message: "=DEBUG= Es Tipo = " + resultado.esTipo(texto) })
                    logger.debug({ message: "=DEBUG= Es Cliente = " + resultado.esCliente(texto) })
                    logger.debug({ message: "=DEBUG= Es Importe = " + resultado.esImporte(texto) })
                    logger.debug({ message: "=DEBUG= Resultado=" + JSON.stringify(resultado) })
                }

                if (resultado.esTipo(texto)) {
                    resultado.cargarTipo(texto)
                }

                if (resultado.esCliente(texto)) {
                    // CLIENTE
                    resultado.cargarCliente(texto)
                }

                if (resultado.esImporte(texto)) {
                    // IMPORTE
                    resultado.cargarImporte(texto)
                }

                if (resultado.completo()) {
                    break;
                }
            };

            if (!resultado.completo()) {
                logger.debug({ message: "=ERROR= No se completo el resultado => " + JSON.stringify(resultado) })
            }

            done(resultado);
        });

        pdfParser.loadPDF(archivo)
    }
}

module.exports = {
    AnalizadorPDF,
    Expensas
};