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
            console.log(`ffmpeg spawned for ${streamName}`);
            const args = ['-i', `rtmp://${hostname}/livestreams/${encodeURIComponent(streamKey)}`, '-bsf:v', 'h264_mp4toannexb', '-qscale', '0', '-acodec', 'copy', '-vcodec', 'copy', '-bufsize', ' 1835k', '-f', 'HLS', '-hls_wrap', '8', `/root/livestreams/${streamName}.m3u8`];
            const ffmpeg = spawn('ffmpeg', args);
            ffmpeg.on('exit', () => {
                console.log(`> the ffmpeg spawned for ${streamName} has exited!`);
            });
            ffmpeg.stderr.on('data', (data) => {
                // console.log(data);
            });
            resolve(ffmpeg);
        }).catch(err => {
            reject(err);
        });
    });
};

shdb.readFilePromise(`/etc/letsencrypt/live/${hostname}/privkey.pem`).then(fileData => {
    return Promise.all([shdb.readFilePromise(`/etc/letsencrypt/live/${hostname}/fullchain.pem`), Promise.resolve(fileData)]);
}).then(cert0key1 => {
    const httpsServer = https.createServer({
        'key': cert0key1[1],
        'cert': cert0key1[0]
    }, (req, res) => {
        const splitUrl = req.url.split('/');
        if (req.url === '/' || req.url === '/index' || req.url === '/index.html') {
            console.log(`${req.connection.remoteAddress} => https => ${req.method} => ${req.url}`);
            shdb.readFilePromise(`/root/responses/index.html`).then(fileData => {
                res.writeHead(200, { 'Content-Type': 'text/html' });
                res.end(fileData);
            }).catch(err => {
                res.writeHead(404, { 'Content-Type': 'text/plain' });
                res.end('404');
            });
        } else if (splitUrl[1] === 'responses') {
            console.log(`${req.connection.remoteAddress} => https => ${req.method} => ${req.url}`);
            const responseFile = splitUrl[2];
            shdb.readFilePromise(`/root/responses/${responseFile}`).then(fileData => {
                res.writeHead(200, { 'Content-Type': `${mime.lookup(responseFile)}` });
                res.end(fileData);
            }).catch(err => {
                res.writeHead(404, { 'Content-Type': 'text/plain' });
                res.end('404');
            });
        } else if (splitUrl[1] === 'livestreams') {
            // console.log(`${req.connection.remoteAddress} => https => ${req.method} => ${req.url}`);
            const streamFile = splitUrl[2];
            shdb.readFilePromise(`/root/livestreams/${streamFile}`).then(fileData => {
                res.writeHead(200, { 'Content-Type': `${mime.lookup(streamFile)}` });
                res.end(fileData);
            }).catch(err => {
                console.log(err);
            });
        } else {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('404');
        }
    });
    const wssServer = new WebSocket.Server({ 'server': httpsServer });
    wssServer.on('connection', (ws, req) => {
        console.log(`${req.connection.remoteAddress} => wss => open`);
        ws.on('message', message => {
            console.log(`${req.connection.remoteAddress} => wss => message => ${message}`);
        });
        ws.on('close', () => {
            console.log(`${req.connection.remoteAddress} => wss => close`);
        });
    });
    httpsServer.listen(443, hostname);
    const httpServer = http.createServer((req, res) => {
        console.log(`${req.connection.remoteAddress} => http => ${req.method} => ${req.url}`);
        res.writeHead(301, { 'Location': `https://${hostname}/` });
        res.end('Going somewhere safe.');
    });
    httpServer.listen(80, hostname);
    const rtmpServer = new RtmpServer();
    rtmpServer.on('error', err => {
        throw err;
    });
    rtmpServer.on('client', client => {
        client.on('connect', () => {
            console.log(`> RTMP client ${client.app} has connected.`);
        });
        client.on('publish', ({ streamName }) => {
            console.log(`> RTMP stream ${streamName} publish event.`);
            spawnFfmpegPromise(streamName).then(ffmpeg => {
                // console.log(ffmpeg);
            }).catch(err => {
                console.log(err);
            });;
        });
        client.on('stop', () => {
            console.log(`> RTMP client ${client.app} has disconnected.`);
        });
    });
    rtmpServer.listen(1935);
    return Promise.resolve();
}).then(() => {
    console.log('Quiet... too quiet.');
}).catch(err => {
    console.log(err);
});

process.stdin.resume();
process.on('exit', () => {
    console.log('exit');
});
process.on('SIGINT', () => {
    console.log('SIGINT');
    process.exit()
});
process.on('uncaughtException', err => {
    console.log('uncaughtException');
    console.log(err);
    process.exit()
});