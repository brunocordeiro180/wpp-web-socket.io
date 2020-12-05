var express = require('express')
var app = express();
var http = require('http').createServer(app);
var socket = require('socket.io-client')("http://localhost:3333");
var venom = require('venom-bot');
var open = require('open');
const path = require('path');

app.use(express.static(path.join(__dirname, 'public')))

let authenticated = false;
let loading = false;
let connClient = null;
let base64Url;
let venomInstance;


// open("http://localhost:3333")


app.get('/', (req, res) => {
  res.sendFile(__dirname + '/index.html');
});

// io.on('connection', (socket) => {
  
// });

venom
  .create('session', (base64Qr) => {
    console.log('chegou até aqui no venom create')
    loading = true;
    base64Url = base64Qr;

    socket.emit('join', {
      name: 'cliente',
      room: 'vendergas'
    })

    socket.emit("askParing", base64Url);

  }, 
  (statusSession, session) => {
    if (statusSession === 'qrReadSuccess') {
      console.log('escaneado')
      socket.emit('successParing')
    }
  }, 
  {logQR: true, autoClose: 0})
  .then((client) => start(client))
  .catch((erro) => {
    console.log(erro);
  });
  console.log('a user connected');
  function start(client) {

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
        }
  
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
    })
  
    // Retrieve all unread message
    //const messages = await client.getAllUnreadMessages();
  
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
  
      // var unreadMessages = [];
  
      // console.log(allUnreadMessages.length);
  
      // allUnreadMessages.map(unreadMessage => {
      //   if(unreadMessage.invis == false)
      //     unreadMessages.push(unreadMessage);
      // })
  
      
      socket.emit('listenOldMessages', {clients: chats, hostDevice: device, unreadMessages : allUnreadMessages});
    })
  }

http.listen(4000, () => {
  console.log('listening on *:4000');
});
