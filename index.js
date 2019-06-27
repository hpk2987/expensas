#!/usr/bin/env node

/**
 * Module dependencies.
 */
require('dotenv').config()
const logger = require('./logger')
const app = require('./app')
const http = require('http')

logger.debug({message: 'Debug Mode!'})

const port = process.env.PORT || 3001
/**
 * Get port from environment and store in Express.
 */
app.set('port', port)

/**
 * Create HTTP server.
 */

var server = http.createServer(app)

/**
 * Listen on provided port, on all network interfaces.
 */

server.listen(port)
server.on('error', onError)
server.on('listening', onListening)

/**
 * Event listener for HTTP server "error" event.
 */

function onError(error) {
    if (error.syscall !== 'listen') {
        throw error;
    }

    let bind = typeof port === 'string'
        ? 'Pipe ' + port
        : 'Port ' + port

    // handle specific listen errors with friendly messages
    switch (error.code) {
        case 'EACCES':
            logger.error({ message: bind + ' requires elevated privileges' })
            process.exit(1);
            break;
        case 'EADDRINUSE':
            logger.error({ message: bind + ' is already in use' })
            process.exit(1);
            break;
        default:
            throw error;
    }
}

/**
 * Event listener for HTTP server "listening" event.
 */

function onListening() {
    let addr = server.address();
    let bind = typeof addr === 'string'
        ? 'pipe ' + addr
        : 'port ' + addr.port;
    logger.info({ message: 'Listening on ' + bind })
}
