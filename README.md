# XY Websocket

Simple protocol for awaitable rpc calls and events over a websocket connection.

## Server examples

```javascript
import http from 'http'
import Koa from 'koa'
import { createServer } from 'xy-websocket'

// Koa or express. httpServer is required
const app = new Koa()
const httpServer = http.createServer(app.callback())
const wsServer = createServer({ httpServer })

// server can register functions
wsServer.register('function_provided_by_server', async ({ params }) => {
  // exceptions are handled correctly
  throw new Error('error message')
  // return value is sent back to the client
  return { json_data: true }
})
// functions can be unregistered
wsServer.unregister('function_provided_by_server')
// publish to all connected clients
wsServer.broadcast('event_name_published_by_server', { json_data: true })
// client published events
wsServer.on('event_name_published_by_client', async ({ params }) => {
})

for (const s of wsServer.sockets) {
  try {
    // call a function provided by a client
    const result = await s.call('function_provided_by_client', { json_data: true })
  }
  catch (e) {
    // exceptions are handled correctly
    console.error(e)
  }
  // publish to a single client
  s.sendEvent('event_name_published_by_server', { json_data: true })
}
```

## Client examples

```javascript
import { createClient } from 'xy-websocket'

const wsClient = createClient({ url: 'https://api.xylogistics.io'.replace(/^http/, 'ws') })

wsClient.on('connected', async () => {
  // client can register functions
  wsClient.register('function_provided_by_client', async ({ params }) => {
    // exceptions are handled correctly
    throw new Error('error message')
    // return value is sent back to the server
    return { json_data: true }
  })
  // functions can be unregistered
  wsClient.unregister('function_provided_by_client')
  // publish an event to the server
  wsClient.send('event_name_published_by_client', { json_data: true })
  // server published events
  wsClient.on('event_name_published_by_server', async ({ params }) => {
  })

  try {
    // call a function provided by the server
    const result = await wsClient.call('function_provided_by_server', { json_data: true })
  }
  catch (e) {
    // exceptions are handled correctly
    console.error(e)
  }
})
```
