import { createServer } from 'http'
import staticHandler from 'serve-handler'
import { WebSocketServer, WebSocket } from 'ws'
import amqp from 'amqplib'
import JSONStream from 'JSONStream'
import superagent from 'superagent'

const httpPort = process.argv[2] || 8080

async function main () {
    const connection = await amqp.connect('amqp://localhost')
    const channel = await connection.createChannel()
    await channel.assertExchange('chat', 'fanout')

    const { queue } = await channel.assertQueue(
      `chat_srv_${httpPort}`,
      { exclusive: true }
    )
    await channel.bindQueue(queue, 'chat')
    channel.consume(queue, msg => {
        msg = msg.content.toString()
        console.log(`From queue: ${msg}`)
        broadcast(msg)
    }, { noAck: true })

    // Serve static files
    const server = createServer((req, res) => {
        return staticHandler(req, res, { public: 'www' })
    })

    const wss = new WebSocketServer({ server })
    wss.on('connection', client => {
        console.log('Client connected')
        client.on('message', msg => {
            console.log(`Message: ${msg}`)
            channel.publish('chat', '', Buffer.from(msg))
        })

        // Query the history service
        superagent
          .get('http://localhost:8090')
          .on('error', err => console.error(err))
          .pipe(JSONStream.parse('*'))
          .on('data', msg => {
              // Serialize the message before sending
              client.send(JSON.stringify(msg))
          })
    })

    function broadcast (msg) {
        for (const client of wss.clients) {
            if (client.readyState === WebSocket.OPEN) {
                client.send(msg)
            }
        }
    }

    server.listen(httpPort, () => {
        console.log(`Server listening on port ${httpPort}`)
    })
}

main().catch(err => console.error(err))
