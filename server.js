import short from 'short-uuid'
import ws, { WebSocketServer } from 'isomorphic-ws'
import { Hub } from './hub.js'

export default ({
  httpServer,
  call_timeout = 2000,
  protocol = {
    event_prefix: 'e.',
    call_prefix: 'c.',
    resolve_prefix: 'resolve.',
    reject_prefix: 'reject.'
  }
} = {}) => {
  const { event_prefix, call_prefix, resolve_prefix, reject_prefix } = protocol
  const hub = Hub()
  const wsServer = new WebSocketServer({ noServer: true })
  const registry = new Map()
  const call_promise = new Map()

  wsServer.on('connection', socket => {
    socket.is_alive = true
    hub.emit('connected', socket)
    socket.on('pong', () => (socket.is_alive = true))
    socket.on('message', async data => {
      const { e: event, p: payload, id } = JSON.parse(data)
      if (event.startsWith(event_prefix))
        return hub.emit(event.slice(event_prefix.length), payload ?? {}, socket)
      if (event.startsWith(call_prefix)) {
        const fn_name = event.slice(call_prefix.length)
        if (!registry.has(fn_name))
          return socket.send(JSON.stringify({ e: `${reject_prefix}${fn_name}`, id, p: {
            message: `'${fn_name}' not found`
          } }))
        try {
          const result = await registry.get(fn_name)(payload ?? {}, socket)
          return socket.send(JSON.stringify({ e: `${resolve_prefix}${fn_name}`, id, p: result ?? {} }))
        }
        catch (e) {
          console.error('Error in websocket call', e, event, payload)
          return socket.send(JSON.stringify({ e: `${reject_prefix}${fn_name}`, id, p: {
            message: `${e.name}: ${e.message}`
          } }))
        }
      }
      if (event.startsWith(resolve_prefix)) {
        if (call_promise.has(id)) {
          const { resolve } = call_promise.get(id)
          call_promise.delete(id)
          resolve(payload)
        }
      }
      if (event.startsWith(reject_prefix)) {
        if (call_promise.has(id)) {
          const { reject } = call_promise.get(id)
          call_promise.delete(id)
          reject(new Error(payload.message))
        }
      }
    })
    socket.on('close', () => hub.emit('disconnected', socket))
    socket.sendEvent = (e, p) => {
      if (!api.is_connected(socket)) throw new NotConnected()
      socket.send(JSON.stringify({ e: `${event_prefix}${e}`, p }))
    }
    socket.call = (c, p) => {
      if (!api.is_connected(socket)) throw new NotConnected()
      const id = short.generate()
      const result = new Promise((resolve, reject) => {
        call_promise.set(id, { resolve, reject })
      })
      setTimeout(() => {
        if (call_promise.has(id)) {
          const { reject } = call_promise.get(id)
          call_promise.delete(id)
          reject(new CallWaitTimeout())
        }
      }, call_timeout)
      socket.send(JSON.stringify({ e: `${call_prefix}${c}`, p, id }))
      return result
    }
  })

  const interval = setInterval(() => {
    for (const socket of wsServer.clients) {
      if (socket.isAlive === false) return socket.terminate()
      socket.is_alive = false
      socket.ping(() => {})
    }
  }, 30000)

  wsServer.on('close', () => {
    clearInterval(interval)
    hub.emit('close')
  })

  httpServer.on('upgrade', (req, socket, head) => {
    wsServer.handleUpgrade(req, socket, head, socket => {
      wsServer.emit('connection', socket, req)
    })
  })

  const api = {
    wsServer,
    on: hub.on,
    off: hub.off,
    broadcast: (e, p) => {
      for (const socket of wsServer.clients) {
        if (!api.is_connected(socket)) continue
        socket.sendEvent(e, p)
      }
    },
    sockets: () => wsServer.clients,
    is_connected: socket => socket != null && socket.readyState === ws.OPEN,
    register: (name, fn) => registry.set(name, fn),
    unregister: name => registry.delete(name),
    OPEN: ws.OPEN,
    CONNECTING: ws.CONNECTING,
    CLOSING: ws.CLOSING,
    CLOSED: ws.CLOSED
  }

  return api
}
