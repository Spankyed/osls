const hostname = ''; // opensourcelivestream.com
const shdb = require('shdb');
const http = require('http');
const https = require('https');
const WebSocket = require('ws');
const RtmpServer = require('rtmp-server');
const { spawn } = require('child_process');
const spawnFfmpeg = streamKey => {
    const args = ['-i', `rtmp://${hostname}/live/${streamKey}`, '-bsf:v', 'h264_mp4toannexb', '-qscale', '0', '-acodec', 'copy', '-vcodec', 'copy', '-bufsize', ' 1835k', '-f', 'HLS', '-hls_wrap', '8', '/root/videos/index.m3u8'];
    const ffmpeg = spawn('ffmpeg', args);
    console.log(`ffmpeg spawned for ${streamKey}`);
    ffmpeg.on('exit', () => {
        console.log(`the ffmpeg spawned for ${streamKey} exited`);
    });
    ffmpeg.stderr.on('data', function(data) {
        console.log(`${streamKey} data: ${data}`);
    });
    return ffmpeg;
}
shdb.readFilePromise(`/etc/letsencrypt/live/${hostname}/privkey.pem`).then(fileData => {
    return Promise.all([shdb.readFilePromise(`/etc/letsencrypt/live/${hostname}/fullchain.pem`), Promise.resolve(fileData)]);
}).then(cert0key1 => {
    const httpsServer = https.createServer({
        'key': cert0key1[1],
        'cert': cert0key1[0]
    }, (req, res) => {
        console.log(`${req.connection.remoteAddress} => https => ${req.method} => ${req.url}`);
        if (req.url === '/') {
            shdb.readFilePromise(`/root/responses/html/index.html`).then(fileData => {
                res.writeHead(200, { 'Content-Type': 'text/html' });
                res.end(fileData);
            }).catch(err => {
                res.writeHead(404, { 'Content-Type': 'text/plain' });
                res.end('404');
            });
        } else if (req.url === '/index.m3u8') {
            shdb.readFilePromise(`/root/videos/index.m3u8`).then(fileData => {
                res.writeHead(200, { 'Content-Type': 'application/vnd.apple.mpegurl' });
                res.end(fileData.toString('utf8'), 'utf8');
            }).catch(err => {
                res.writeHead(404, { 'Content-Type': 'text/plain' });
                res.end('404');
            });
        } else if (req.url.indexOf('index') !== -1 && req.url.indexOf('.ts') !== -1) {
            shdb.readFilePromise(`/root/videos${req.url}`).then(fileData => {
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
            console.log(`RTMP client ${client.app} has connected`);
        });
        client.on('play', ({ streamName }) => {
            console.log(`RTMP stream ${streamName} play event`);
        });
        client.on('publish', ({ streamName }) => {
            console.log(`RTMP stream ${streamName} publish event`);
            spawnFfmpeg(streamName);
        });
        client.on('stop', () => { // client.on('stop', client??? => { 
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