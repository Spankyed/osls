const hostname = 'opensourcelivestream.com';
const shdb = require('shdb');

const http = require('http');
const https = require('https');
const WebSocket = require('ws');
const RtmpServer = require('rtmp-server');
// all of the above will become what's below 
// const shws = require('shws');
const { spawn } = require('child_process');
const spawnFfmpeg = (hostname, streamName) => {
    const args = ['-i', `rtmp://${hostname}/live/${streamName}`, '-bsf:v', 'h264_mp4toannexb', '-qscale', '0', '-acodec', 'copy', '-vcodec', 'copy', '-bufsize', ' 1835k', '-f', 'HLS', '-hls_wrap', '8', 'index.m3u8'];
    const ffmpeg = spawn('ffmpeg', args);
    console.log(`ffmpeg spawned for ${streamName}`);

    ffmpeg.on('exit', () => {
        console.log(`the ffmpeg spawned for ${streamName} exited`);
    });
    ffmpeg.stderr.on('data', function(data) {
        console.log(`${streamName} data: ${data}`);
    });
    return ffmpeg;
}
shdb.readFilePromise(`/etc/letsencrypt/live/${hostname}/privkey.pem`).then(fileData => {
    return Promise.all([shdb.readFilePromise(`/etc/letsencrypt/live/${hostname}/fullchain.pem`), Promise.resolve(fileData)]);
}).then(fileDatas => {
    const httpsServer = https.createServer({
        'key': fileDatas[1],
        'cert': fileDatas[0]
    }, (req, res) => {
        console.log(`${req.connection.remoteAddress} => https => ${req.method} => ${req.url}`);
        if (req.url === '/') {
            shdb.readFilePromise(`/root/${hostname}/responses/html/index.html`).then(fileData => {
                res.writeHead(200, { 'Content-Type': 'text/html' });
                res.end(fileData);
            }).catch(err => {
                res.writeHead(404, { 'Content-Type': 'text/plain' });
                res.end('404');
            });
        } else if (req.url === '/index.m3u8') {
            shdb.readFilePromise(`/root/${hostname}/videos/index.m3u8`).then(fileData => {
                res.writeHead(200, { 'Content-Type': 'application/vnd.apple.mpegurl' });
                res.end(fileData.toString('utf8'), 'utf8');
            }).catch(err => {
                res.writeHead(404, { 'Content-Type': 'text/plain' });
                res.end('404');
            });
        } else if (req.url.indexOf('index') !== -1 && req.url.indexOf('.ts') !== -1) {
            shdb.readFilePromise(`/root/${hostname}/videos${req.url}`).then(fileData => {
                res.writeHead(200, { 'Content-Type': 'video/mp2t' });
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
    return Promise.resolve();
}).then(() => {
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
            console.log(`CONNECT ${client.app}`);
        });
        client.on('play', ({ streamName }) => {
            console.log(`PLAY ${streamName}`);
        });
        client.on('publish', ({ streamName }) => {
            console.log(`PUBLISH ${streamName}`);
            spawnFfmpeg(hostname, streamName);
        });
        client.on('stop', () => {
            console.log('client disconnected');
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
process.on('exit', () => {});
process.on('SIGINT', () => {
    process.exit()
});
process.on('uncaughtException', () => {
    process.exit()
});