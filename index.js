import { createServer } from 'http';
import staticHandler from 'serve-handler';
import { WebSocketServer } from 'ws';
import Redis from 'ioredis';

const redisOptions = {
  password: '', // Replace with your actual Redis password
};

const redisSub = new Redis(redisOptions);
const redisPub = new Redis(redisOptions);

const server = createServer((req, res) => {
  return staticHandler(req, res, { public: 'www' });
});

const wss = new WebSocketServer({ server });

wss.on('connection', client => {
  console.log('Client connected');
  client.on('message', msg => {
    console.log(`Message: ${msg}`);
    redisPub.publish('chat_messages', msg);
    broadcast(msg);
  });
});

redisSub.subscribe('chat_messages');
redisSub.on('message', (channel, msg) => {
  for (const client of wss.clients) {
    if (client.readyState === client.OPEN) {
      client.send(msg);
    }
  }
});

server.listen(process.argv[2] || 8080);
