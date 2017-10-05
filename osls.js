const hostname = ''; // opensourcelivestream.com
const streamNameSecret = 'secret string';
const shdb = require('shdb');
const http = require('http');
const https = require('https');
const WebSocket = require('ws');
const RtmpServer = require('rtmp-server');
const mime = require('mime-types');
const { spawn } = require('child_process');
const crypto = require('crypto');

const cipherStreamNamePromise = streamName => {
    return new Promise((resolve, reject) => {
        let streamNameCipher = crypto.createCipher('aes192', streamNameSecret);
        let encrypted = '';
        streamNameCipher.on('readable', () => {
            const data = streamNameCipher.read();
            if (data) {
                encrypted += data.toString('base64');
            }
        });
        streamNameCipher.on('end', () => {
            resolve(encrypted);
        });
        streamNameCipher.write(streamName);
        streamNameCipher.end();
    });
};
const decipherStreamNamePromise = cipheredStreamName => {
    return new Promise((resolve, reject) => {
        let streamNameDecipher = crypto.createDecipher('aes192', streamNameSecret);
        let decrypted = '';
        streamNameDecipher.on('readable', () => {
            const data = streamNameDecipher.read();
            if (data) {
                decrypted += data.toString('utf8');
            }
        });
        streamNameDecipher.on('end', () => {
            resolve(decrypted);
        });
        streamNameDecipher.write(cipheredStreamName, 'base64');
        streamNameDecipher.end();
    });
};
const spawnFfmpegPromise = streamKey => {
    return new Promise((resolve, reject) => {
        decipherStreamNamePromise(streamKey).then(decipheredStreamName => {
            const streamName = decipheredStreamName;
            const args = ['-i', `rtmp://${hostname}/livestreams/${encodeURIComponent(streamKey)}`, '-bsf:v', 'h264_mp4toannexb', '-qscale', '0', '-acodec', 'copy', '-vcodec', 'copy', '-bufsize', ' 1835k', '-f', 'HLS', '-hls_wrap', '8', `/root/livestreams/${streamName}.m3u8`];
            const ffmpeg = spawn('ffmpeg', args);
            ffmpeg.on('exit', () => {
                console.log(`stream '${streamName}' stopped`);
            });
            ffmpeg.stderr.on('data', (data) => {});
            resolve(ffmpeg);
        }).catch(err => {
            reject(err);
        });
    });
};


shdb.readFilePromise(`/etc/letsencrypt/live/${hostname}/privkey.pem`).then(keyData => {
    return Promise.all([Promise.resolve(keyData), shdb.readFilePromise(`/etc/letsencrypt/live/${hostname}/fullchain.pem`)]);
}).then(key0cert1 => {
    const httpsServer = https.createServer({
        'key': key0cert1[0],
        'cert': key0cert1[1]
    }, (req, res) => {
        const splitUrl = req.url.split('/');
        if (req.url === '/' || req.url === '/index' || req.url === '/index.html') {
            shdb.readFilePromise(`/root/responses/index.html`).then(fileData => {
                res.writeHead(200, { 'Content-Type': 'text/html' });
                res.end(fileData);
            }).catch(err => {
                res.writeHead(404, { 'Content-Type': 'text/plain' });
                res.end('404');
            });
        } else if (splitUrl[1] === 'responses') {
            const responseFile = splitUrl[2];
            shdb.readFilePromise(`/root/responses/${responseFile}`).then(fileData => {
                res.writeHead(200, { 'Content-Type': `${mime.lookup(responseFile)}` });
                res.end(fileData);
            }).catch(err => {
                res.writeHead(404, { 'Content-Type': 'text/plain' });
                res.end('404');
            });
        } else if (splitUrl[1] === 'livestreams') {
            const streamFile = splitUrl[2];
            shdb.readFilePromise(`/root/livestreams/${streamFile}`).then(fileData => {
                res.writeHead(200, { 'Content-Type': `${mime.lookup(streamFile)}` });
                res.end(fileData);
            }).catch(err => {
                res.writeHead(404, { 'Content-Type': 'text/plain' });
                res.end('404');
            });
        } else {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('404');
        }
    });
    httpsServer.listen(443, hostname);
    const wssServer = new WebSocket.Server({ 'server': httpsServer });
    wssServer.on('connection', (ws, req) => {
        ws.connection = { remoteAddress: req.connection.remoteAddress };
        ws.chatRoom = req.url.replace('/', '');
        ws.on('message', messageFromClient => {
            Promise.resolve(JSON.parse(messageFromClient)).then(jsonMessageFromClient => {
                switch (jsonMessageFromClient.type) {
                    case 'open':
                        {
                            console.log(`${ws.connection.remoteAddress} > wss > open`);
                            ws.send(JSON.stringify({
                                originalTimestamp: jsonMessageFromClient.timestamp,
                                newTimestamp: (new Date().getTime())
                            }));
                            break;
                        }
                    case 'chat':
                        {
                            console.log(`${ws.connection.remoteAddress} > wss > message > ${jsonMessageFromClient.message}`);
                            wssServer.clients.forEach((client, i) => {
                                if (client.chatRoom === jsonMessageFromClient.chatRoom) {
                                    client.send(JSON.stringify({
                                        type: 'chat',
                                        message: jsonMessageFromClient.message
                                    }));
                                }
                            });
                            break;
                        }
                    case 'pong':
                        {
                            break;
                        }
                    default:
                        {}
                }
            }).catch(err => {
                console.log(err);
            });
        });
        ws.on('close', () => {
            console.log(`${ws.connection.remoteAddress} > wss > close`);
        });
    });
    const httpServer = http.createServer((req, res) => {
        res.writeHead(301, { 'Location': `https://${hostname}/` });
        res.end('Going somewhere safe.');
    });
    httpServer.listen(80, hostname);
    const rtmpServer = new RtmpServer();
    rtmpServer.on('error', err => {
        throw err;
    });
    rtmpServer.on('client', client => {
        client.on('connect', () => {});
        client.on('publish', ({ streamName }) => {
            spawnFfmpegPromise(streamName).then(ffmpeg => {
                console.log(`stream '${streamName}' started`);
            }).catch(err => {});;
        });
        client.on('stop', () => {});
    });
    rtmpServer.listen(1935);
}).catch(err => {
    console.log(err);
});

process.stdin.resume();
process.on('exit', () => {});
process.on('SIGINT', () => {
    process.exit()
});
process.on('uncaughtException', err => {
    process.exit()
});