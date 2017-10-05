const establishWebSocketConnectionPromise = chatRoom => {
    return new Promise((resolve, reject) => {
        const establishWebSocketConnectionPromiseTimeout = setTimeout(() => {
            reject('establishWebSocketConnectionPromiseTimeout...');
        }, 10000);
        let timestamp = (new Date().getTime());
        var socket = new WebSocket(`wss://opensourcelivestream.com/${chatRoom}`);
        socket.onopen = () => {
            socket.send(JSON.stringify({
                'type': 'open',
                'timestamp': timestamp
            }));
        };
        socket.onmessage = messageFromServer => {
            const jsonMessageFromServer = JSON.parse(messageFromServer.data);
            if (jsonMessageFromServer.originalTimestamp === timestamp) {
                socket['client_server_open_delay'] = jsonMessageFromServer.newTimestamp - timestamp;
                socket['server_client_open_delay'] = (new Date().getTime()) - jsonMessageFromServer.newTimestamp;
                socket['chatRoom'] = chatRoom;
                socket.onmessage = messageFromServer => {};
                clearTimeout(establishWebSocketConnectionPromiseTimeout);
                resolve(socket);
            } else {
                reject('wrong timestamp?');
            }
        };
    });
};
document.addEventListener("DOMContentLoaded", () => {
    // when the document is finished loading...
    let bannerMessageRow = document.querySelector('#bannerMessageRow');
    let bannerMessageCol = document.querySelector('#bannerMessageCol');
    let bannerMessage = document.querySelector('#bannerMessage');
    let videoChatRow = document.querySelector('#videoChatRow');
    let videoCol = document.querySelector('#videoCol');
    let chatCol = document.querySelector('#chatCol');
    let message = document.querySelector('#message');
    let video = document.querySelector('#video');
    let send = document.querySelector('#send');
    let body = document.querySelector('body');
    // for now we set the video to a default source.
    let livestreamSource = 'test';
    establishWebSocketConnectionPromise(livestreamSource).then(socket => {
        socket.onmessage = messageFromServer => {
            const jsonMessageFromServer = JSON.parse(messageFromServer.data);
            console.log(jsonMessageFromServer);
            switch (jsonMessageFromServer.type) {
                case 'chat':
                    {
                        let newMessage = document.createElement('div');
                        newMessage.setAttribute('class', 'row no-gutters');
                        let message = document.createElement('p');
                        message.innerText = `anon: ${jsonMessageFromServer.message}`;
                        newMessage.appendChild(message);
                        chatCol.insertBefore(newMessage, chatCol.children[1]);
                        break;
                    }
                case 'ping':
                    {
                        socket.send(JSON.stringify({
                            type: 'pong',
                            timestamp: (new Date().getTime())
                        }));
                        break;
                    }
                default:
                    {}
            }
        };
        if (Hls.isSupported()) {
            let hls = new Hls();
            hls.loadSource(`/livestreams/${livestreamSource}.m3u8`);
            hls.attachMedia(video);
            hls.on(Hls.Events.MANIFEST_PARSED, () => {
                video.play();
            });
        } else {
            console.log('are were here with a working stream? if so, this works... kek.');
            video.src = `/livestreams/${livestreamSource}.m3u8`;
            // i dont know if this works...
        }
        body.addEventListener('keypress', event => {
            const key = event.which || event.keyCode;
            if (key === 13 && message.value !== '') {
                send.click();
            }
        });
        send.onclick = () => {
            if (message.value !== '') {
                socket.send(JSON.stringify({
                    type: 'chat',
                    chatRoom: socket.chatRoom,
                    message: message.value,
                    accessToken: localStorage.getItem('accessToken'),
                    timestamp: (new Date().getTime())
                }));
                message.value = '';
            }
        };
    }).catch(err => {
        console.log(err);
    });
});