import { createServer } from 'http'
import { Level } from 'level'
import timestamp from 'monotonic-timestamp'
import JSONStream from 'JSONStream'
import amqp from 'amqplib'

/*
    This is a simple example of a server that uses the amqp library to connect to a RabbitMQ server.
    The module is made up of two parts:
    - an HTTP server to expose the chat history to clients
    - an AMQP consumer responsible for capturing the chat messages
      and storing them in a local database
*/
async function main () {
    const db = new Level('./msgHistory', { valueEncoding: 'json' })

    // Connect to RabbitMQ
    const connection = await amqp.connect('amqp://localhost')
    const channel = await connection.createChannel()

    // Set up an exchange and queue
    await channel.assertExchange('chat', 'fanout')
    const { queue } = await channel.assertQueue('chat_history')
    await channel.bindQueue(queue, 'chat')

    // Consume messages and store them in the database
    channel.consume(queue, async msg => {
        const content = msg.content.toString()
        console.log(`Saving message: ${content}`)
        await db.put(timestamp(), content)
        channel.ack(msg)
    })

    // HTTP server to expose chat history
    createServer(async (req, res) => {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        const iterator = db.iterator()

        const jsonStream = JSONStream.stringify()
        jsonStream.pipe(res)

        for await (const [key, value] of iterator) {
            jsonStream.write({ timestamp: key, message: value })
        }

        jsonStream.end()
    }).listen(8090, () => {
        console.log('HTTP server listening on port 8090')
    })
}


main().catch(err => console.error(err))

