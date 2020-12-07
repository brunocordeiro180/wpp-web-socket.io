var express = require('express')
var app = express();
var http = require('http').createServer(app);
var ioLocal = require('socket.io')(http)
var socket = require('socket.io-client')("http://localhost:3333");
var venom = require('venom-bot');
var open = require('open');
const rimraf = require('rimraf');
const path = require('path');

app.use(express.static(path.join(__dirname, 'public')))

let base64Url = null;
let connClient = null;

app.get('/', (req, res) => {
  res.sendFile(__dirname + '/index.html');
});

const init = () => {
  ioLocal.emit("loading")
  venom
    .create('session', (base64Qr) => {
      ioLocal.emit("loadingFalse")
      base64Url = base64Qr;
      ioLocal.emit("paring", base64Url);
    }, 
    (statusSession, session) => {
      if (statusSession === 'qrReadSuccess') {
        ioLocal.emit('success')
        socket.emit('successOnConnect')
      }
    }, 
    {logQR: false, autoClose: 0})
    .then(client => {
      connClient = client;
      ioLocal.emit("isAuthenticated");
      start(client)
    })
    .catch((erro) => {
      console.log(erro);
    });
}
init();

function kill(){
  console.log('killed')
  rimraf("tokens", () => {
    connClient.close();
  })
  init()
}
  
function start(client) {
  socket.emit('join', {
    name: 'cliente',
    room: 'vendergas'
  });
  client.onMessage(async msg => {
    if (msg.from !== 'status@broadcast') {
      if (msg.isMedia == true || msg.isMMS == true) {
        try {
          const buffer = await client.decryptFile(msg); 
          let base64data = Buffer.from(buffer).toString('base64');
          let imagebase64 = 'data:'+msg.mimetype+';base64,'+base64data;

          socket.emit('moduleSend', {
            msgContent: imagebase64,
            type: msg.type,
            from: msg.from,
            to: msg.to,
            name: msg.sender.pushname ? msg.sender.pushname : msg.from,
            avatar: msg.sender.profilePicThumbObj.img ? msg.sender.profilePicThumbObj.img : 'none',
            timestamp: msg.timestamp 
          });
        } catch (err) {
          console.error(err);
          console.log('Ocorreu um erro ao realizar decode64 do arquivo');
        }    
      }else{
        socket.emit('moduleSend', {
          msgContent: msg.body,
          type: msg.type,
          from: msg.from,
          to: msg.to,
          name: msg.sender.pushname ? msg.sender.pushname : msg.from,
          avatar: msg.sender.profilePicThumbObj.img ? msg.sender.profilePicThumbObj.img : 'none',
          timestamp: msg.timestamp 
        });
      }
    } 
  })
  
  client.onStateChange(state => {
    if ('CONFLICT'.includes(state)) {
      kill()
      socket.emit('errorOnConnect')
    }
    if ('UNPAIRED'.includes(state)) {
      kill()
      socket.emit('errorOnConnect')
    }
    if('CONNECTED'.includes(state)) {
      socket.emit('successOnConnect')
    }
  })

  socket.on('frontReceive', async data => {
    await client.sendSeen(data.to);
    client.sendText(data.to, String(data.msgContent));
  })

  socket.on('markAsRead', async data => {
    await client.sendSeen(data);
  })

  socket.on("oldMessages", async () => {
    const chats = await client.getAllChats();
    const device = await client.getHostDevice();
    const allUnreadMessages = await client.getAllUnreadMessages();
    allUnreadMessages.map(async (unreadMessage, i) => {
      if(unreadMessage.isMedia || unreadMessage.isMMS){
        const buffer = await client.decryptFile(unreadMessage); 
        let base64data = Buffer.from(buffer).toString('base64');
        let imagebase64 = 'data:'+unreadMessage.mimetype+';base64,'+base64data;
        
        allUnreadMessages[i].body = imagebase64;
      }
    })    
    socket.emit('listenOldMessages', {clients: chats, hostDevice: device, unreadMessages : allUnreadMessages});
  })
}


ioLocal.on('connection', clientLocal => {
  clientLocal.on('closeConnection', () => {
    kill()
    socket.emit('errorOnConnect')
  })
})




http.listen(4000, () => {
  open("http://localhost:4000")
  console.log('listening on *:4000');
});
