import { createServer } from 'http'
import level from 'level'
import timestamp from 'monotonic-timestamp'
import JSONStream from 'JSONStream'
import amqp from 'amqplib'

/*
    This is a simple example of a server that uses the amqp library to connect to a Rabbit
    The module is made up of two parts:
    an HTTP server to expose the chat history to clients,
    and an AMQP consumer responsible for capturing the chat messages
    and storing them in a local database
*/
async function main () {
    const db = level('./msgHistory')

    const connection = await amqp.connect('amqp://localhost')
    const channel = await connection.createChannel()

    await channel.assertExchange('chat', 'fanout')
    const { queue } = channel.assertQueue('chat_history')
    await channel.bindQueue(queue, 'chat')

    channel.consume(queue, async msg => {
        const content = msg.content.toString()
        console.log(`Saving message: ${content}`)
        await db.put(timestamp(), content)
        channel.ack(msg)
    })
    createServer((req, res) => {
        res.writeHead(200)
        db.createValueStream()
        .pipe(JSONStream.stringify())
        .pipe(res)
    }).listen(8090)
}
main().catch(err => console.error(err))