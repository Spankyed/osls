const shdb = require('shdb');
const http = require('http');
const https = require('https');
const geoip = require('geoip-lite');
const serverStartTime = (new Date).getTime();
const WebSocketServer = require('websocket').server;
const hashFunction = require('argon2');
let remoteAddresses = {};
let serverHits = 0;
const generateHashPromise = data => {
    return new Promise((resolve, reject) => {
        hashFunction.hash(data, {
            type: hashFunction.argon2d
        }).then(hash => {
            resolve(hash);
        }).catch(err => {
            reject('Something went wrong.');
        });
    });
};
const verifyHashPromise = (data, hash) => {
    return new Promise((resolve, reject) => {
        hashFunction.verify(`$argon2d$v=19$m=4096,t=3,p=1\$${hash}`, data).then(match => {
            if (match) {
                resolve('verifyHashPromise => pass');
            } else {
                reject('verifyHashPromise => fail');
            }
        }).catch(err => {
            reject(err);
        });
    });
};
const logRequestPromise = (remoteAddress, request, timeout = 3000) => {
    return new Promise((resolve, reject) => {
        const logRequestPromiseTimeout = setTimeout(() => {
            reject('logRequestPromise timeout');
        }, timeout);
        const timestamp = (new Date).getTime();
        if (Object.keys(remoteAddresses).indexOf(remoteAddress) !== -1) {
            if (geoip.lookup(remoteAddress) === remoteAddresses[request.connection.remoteAddress].geoip) {} else {
                remoteAddresses[remoteAddress].geoip = geoip.lookup(remoteAddress);
            }
            const lastRequest = remoteAddresses[remoteAddress].latestRequest;
            remoteAddresses[remoteAddress].latestRequest = timestamp;
            remoteAddresses[remoteAddress].requestCount++;
            remoteAddresses[remoteAddress].requests.push(request);
            clearTimeout(logRequestPromiseTimeout);
            resolve(remoteAddresses[remoteAddress]);
        } else {
            remoteAddresses[remoteAddress] = {
                'requestCount': 1,
                'joined': timestamp,
                'geoip': geoip.lookup(remoteAddress),
                'requests': [request],
                'latestRequest': timestamp
            };
            clearTimeout(logRequestPromiseTimeout);
            resolve(remoteAddresses[remoteAddress]);
        }
    });
};
http.createServer((request, response) => {
    serverHits++;
    logRequestPromise(request.connection.remoteAddress, request).then(out => {
        console.log(`'${request.connection.remoteAddress}' => '${request.url}' @ '${(new Date).getTime()}'`);
        response.writeHead(302, {
            'Location': 'https://opensourcelivestream.com/'
        });
        response.end();
    }).catch(err => {
        console.log(err);
        response.writeHead(500, { 'Content-Type': 'text/plain' });
        response.end();
    });
}).listen(80, '198.211.105.49');
const httpsServer = https.createServer({
    key: fs.readFileSync('/etc/letsencrypt/live/opensourcelivestream.com/privkey.pem'),
    cert: fs.readFileSync('/etc/letsencrypt/live/opensourcelivestream.com/fullchain.pem')
}, (request, response) => {
    serverHits++;
    logRequestPromise(request.connection.remoteAddress, request).then(out => {
        console.log(`'${request.connection.remoteAddress}' => '${request.url}' @ '${(new Date).getTime()}'`);
        response.writeHead(200, { 'Content-Type': 'text/plain' });
        response.end('Under construction.');
    }).catch(err => {
        console.log(err);
        response.writeHead(500, { 'Content-Type': 'text/plain' });
        response.end();
    });
}).listen(443, '198.211.105.49');
const wsServer = new WebSocketServer({
    httpServer: httpsServer,
    autoAcceptConnections: false
});
wsServer.on('request', (request) => {
    if (request.origin != 'https://opensourcelivestream.com') {
        request.reject();
    } else {
        let connection = request.accept('opensourcelivestream-protocol', request.origin);
        logRequestPromise(connection.remoteAddress, request).then(out => {
            console.log(`'${request.connection.remoteAddress}' => 'WSS Connect' @ ${(new Date).getTime()}`);
            serverHits++;
            connection.on('message', message => {});
            connection.on('close', (reasonCode, description) => {
                console.log(`'${request.connection.remoteAddress}' => 'WSS Close' @ '${(new Date).getTime()}'`);
            });
        }).catch(err => {
            console.log(err);
            request.reject();
        });
    }
});