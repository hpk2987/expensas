const logger = require("./logger")
const Datastore = require('nedb');
const moment = require('moment');
const PDFParser = require("pdf2json");

class Expensas {
    constructor(dbname, inMemory) {
        this.file = "./db"+dbname
        this.file2 = "./db/entradas." + dbname
        this.file3 = "./db/servicios." + dbname
        logger.info({ message: "Arrancando desde: " + dbname })
        this.db = {}

        if (inMemory) {
            this.db.cuentas = new Datastore({ inMemoryOnly: true })
            this.db.entradas = new Datastore({ inMemoryOnly: true })
            this.db.servicios = new Datastore({ inMemoryOnly: true })
        } else {
            this.db.cuentas = new Datastore({ filename: this.file, autoload: true })
            this.db.entradas = new Datastore({ filename: this.file2, autoload: true })
            this.db.servicios = new Datastore({ filename: this.file3, autoload: true })
        }
    }

    getEntradasDeCuenta(idCuenta, offset, size, done) {
        logger.info({ message: "Entradas de:" + idCuenta + " | offset:" + offset + " | size:" + size })
        this.db.entradas.find({ cuenta: idCuenta })
            .sort({ secs: -1 })
            .skip(offset)
            .limit(size).exec(function (err, docs) {
                logger.info({ message: "Entradas obtenidas:" + docs.length })
                done(docs)
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
        logger.info({ message: "Agregando entrada:" + JSON.stringify(entrada) });
        this.db.entradas.insert(entrada, done)
    }

    eliminarEntrada(idEntrada, done) {
        logger.info({ message: "Eliminando entrada: " + idEntrada })
        this.db.entradas.remove({ _id: idEntrada }, {}, done)
    }

    getCuentas(callback) {
        var _this = this;
        if (this.cuentasBuffer != null) {
            callback(this.cuentasBuffer)
        } else {
            this.getBucket(this.cuentasId + "/latest", function (cuentas) {
                _this.cuentasBuffer = cuentas
                callback(cuentas)
            });
        }
    }

    agregarCuenta(nombre, done) {
        var cuenta = { nombre: nombre }
        logger.info({ message: "Agregando cuenta nombre:" + JSON.stringify(cuenta) })
        this.db.cuentas.insert(cuenta, done)
    }

    eliminarCuenta(idCuenta, done) {
        logger.info({ message: "Eliminando cuenta :" + idCuenta })
        this.db.cuentas.remove({ _id: idCuenta }, {}, done);
    }

    getCuenta(id, done) {
        this.db.cuentas.find({ _id: id }, done)
    }

    getTotalCuenta(idCuenta, done) {
        this.db.entradas.find({ cuenta: idCuenta }, function (err, docs) {
            if (done) {
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

        logger.info({ message: "Entradas de hoy de:" + idCuenta })
        this.db.entradas.find({ cuenta: idCuenta, secs: { $gt: hoy.getTime() } })
            .sort({ secs: -1 })
            .exec(function (err, docs) {
                logger.info({ message: "Entradas obtenidas:" + docs.length })
                done(err, docs)
            })
    }


    getResumenHoy(callback) {
        let resumen = {
            cuentas: [],
            fecha: moment().format('DD/MM/YYYY')
        }

        getCuentas(function (err, docs) {
            let funcs = [];
            docs.forEach(function (cuenta) {
                funcs.push(function () {
                    getEntradasHoy(cuenta._id, function (err, docs) {
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
                            callback(resumen)
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
            logger.info({ message: "Servicios obtenidas:" + docs.length })
            done(docs)
        });
    }

    getServicio(tipo, cliente, done) {
        let servicio = {
            tipo: tipo,
            cliente: cliente
        };

        this.db.servicios.find(servicio, function (err, docs) {
            if (docs.length > 0) {
                done(docs[0])
            } else {
                done()
            }
        });
    }

    eliminarServicio(idServicio, done) {
        logger.info({ message: "Eliminando servicio :" + idServicio })
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
            if (docs) {
                logger.info({ message: "Agregando servicio:" + JSON.stringify(docs) })
            }
            done(docs)
        });
    }

    /* =================================================================== */
    /* =================================================================== */
    /* PDF ops */
    /* =================================================================== */

    obtenerDatosPDF(archivo, callback, extra) {
        let pdfParser = new PDFParser();

        let resultado = {
            datos: {}
        }
        let operaciones = {
            completo: function (resultado) {
                return (resultado.datos.tipo != null && resultado.datos.cliente != null && resultado.datos.importe != null)
            },

            esTipo: function (valor) {
                return valor.match(/^PAGO DE/i) !== null ||
                    valor.match(/^abonado/i) !== null ||
                    valor.match(/^Descripción Pago/i) !== null
            },

            esCliente: function (valor) {
                return (valor.match(/^NRO.[ ]?DE CLIENTE/i) !== null) ||
                    (valor.match(/^CUIT[ ]*CONTRIBUYENTE/i) !== null)
            },

            esImporte: function (valor) {
                return valor.match(/^IMPORTE:/i) !== null ||
                    valor.match(/IMPORTE$/i) !== null
            },

            cargarTipo: function (resultado, valor) {
                if (valor.match(/ - Comprobante$/)) {
                    valor = valor.replace(/ - Comprobante$/, "")
                }

                if (valor.match(/^PAGO DE/i) !== null) {
                    resultado.datos.tipo = valor.substr(8).trim()
                }

                if (valor.match(/^abonado/i) !== null) {
                    resultado.datos.tipo = valor.substr(9).trim()
                }

                if (valor.match(/^Descripción Pago/i) !== null) {
                    resultado.datos.tipo = valor.substr(17).trim()
                }
            },

            cargarImporte: function (resultado, valor) {
                if (valor.match(/^IMPORTE:/i) !== null) {
                    resultado.datos.importe = parseFloat(valor.substr(valor.indexOf(':') + 3).replace(',', '.'))
                }

                if (valor.match(/IMPORTE$/i) !== null) {
                    resultado.datos.importe = parseFloat(valor.replace(/IMPORTE$/i, '').trim().replace(',', '.'))
                }
            },

            cargarCliente: function (resultado, valor) {
                if ((valor.match(/^NRO.[ ]?DE CLIENTE/i) !== null) ||
                    (valor.match(/^CUIT[ ]*CONTRIBUYENTE/i) !== null)) {

                    if (valor.indexOf(':') !== -1) {
                        resultado.datos.cliente = valor.substr(valor.indexOf(':') + 2)
                    } else {
                        resultado.datos.cliente = valor.substr(19)
                    }
                }
            },
        };

        let ignore = false
        resultado.archivo = archivo
        resultado.extra = extra

        pdfParser.on("pdfParser_dataError", errData => console.error(errData.parserError))

        pdfParser.on("pdfParser_dataReady", pdfData => {
            // Son comprobantes siempre tienen una sola pagina
            var textos = pdfData.formImage.Pages[0].Texts

            var beVerbose = process.env.EXPENSAS_MODO.match(/DEBUG/g) && process.env.EXPENSAS_MODO.match(/VERBOSE/g)

            if (beVerbose) {
                logger.info({ message: "=DEBUG= Full pdf text parse" })
                logger.info({ message: "=DEBUG=" + JSON.stringify(textos) })
            }

            // Agrupar como lineas textos con la misma coordenada "y"
            var agrupados = {};
            for (var i = 0; i < textos.length; i++) {
                var coordenadaY = Math.floor(textos[i].y)
                if (agrupados[coordenadaY.toString()] === undefined) {
                    agrupados[coordenadaY.toString()] = { texto: "" }
                }

                agrupados[coordenadaY.toString()].texto += decodeURIComponent(textos[i].R[0].T) + " "
            }

            for (var key in agrupados) {
                var texto = agrupados[key].texto.trim();

                if (beVerbose) {
                    logger.info({ message: "=DEBUG= Texto=" + texto });
                    logger.info({ message: "=DEBUG= Linea Y=" + key });
                    logger.info({ message: "=DEBUG= Es Tipo = " + operaciones.esTipo(texto) });
                    logger.info({ message: "=DEBUG= Es Cliente = " + operaciones.esCliente(texto) });
                    logger.info({ message: "=DEBUG= Es Importe = " + operaciones.esImporte(texto) });
                    logger.info({ message: "=DEBUG= Resultado=" + JSON.stringify(resultado) });
                }

                if (operaciones.esTipo(texto)) {
                    operaciones.cargarTipo(resultado, texto)
                }

                if (operaciones.esCliente(texto)) {
                    // CLIENTE
                    operaciones.cargarCliente(resultado, texto)
                }

                if (operaciones.esImporte(texto)) {
                    // IMPORTE
                    operaciones.cargarImporte(resultado, texto)
                }

                if (operaciones.completo(resultado)) {
                    break;
                }
            };

            if (beVerbose) {
                console.log("=DEBUG= Texto=" + texto)
                console.log("=DEBUG= Linea Y=" + key)
                console.log("=DEBUG= Es Tipo = " + operaciones.esTipo(texto))
                console.log("=DEBUG= Es Cliente = " + operaciones.esCliente(texto))
                console.log("=DEBUG= Es Importe = " + operaciones.esImporte(texto))
                console.log("=DEBUG= Resultado=" + JSON.stringify(resultado))
            }


            resultado.completo = operaciones.completo(resultado);
            if (!resultado.completo) {
                console.error("=ERROR= No se completo el resultado => " + JSON.stringify(resultado))
            }

            callback(resultado);
        });

        pdfParser.loadPDF(archivo)
    }
}

exports.Expensas = Expensas;