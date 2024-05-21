import short from 'short-uuid'
import ReconnectingWebSocket from 'reconnecting-websocket'
import { Hub } from './hub.js'
import { NotConnected, CallWaitTimeout } from './exceptions.js'

export default ({
  url,
  call_timeout = 2000,
  protocol = {
    event_prefix: 'e.',
    call_prefix: 'c.',
    resolve_prefix: 'resolve.',
    reject_prefix: 'reject.'
  },
  protocols = [],
  wsOptions = {}
}) => {
  const { event_prefix, call_prefix, resolve_prefix, reject_prefix } = protocol
  const hub = Hub()
  const socket = new ReconnectingWebSocket(url, protocols, wsOptions)

  const registry = new Map()
  const call_promise = new Map()

  socket.addEventListener('close', e => hub.emit('disconnected', e))
  socket.addEventListener('error', e => hub.emit('error', e))
  socket.addEventListener('open', e => hub.emit('connected', e))
  socket.addEventListener('message', async e => {
    const { e: event, p: payload, id } = JSON.parse(e.data)
    if (event.startsWith(event_prefix))
      return hub.emit(event.slice(event_prefix.length), payload ?? {})
    if (event.startsWith(call_prefix)) {
      const fn_name = event.slice(call_prefix.length)
      if (!registry.has(fn_name))
        return socket.send(JSON.stringify({ e: `${reject_prefix}${fn_name}`, id, p: {
          message: `'${fn_name}' not found`
        } }))
      try {
        const result = await registry.get(fn_name)(payload ?? {})
        return socket.send(JSON.stringify({ e: `${resolve_prefix}${fn_name}`, id, p: result }))
      }
      catch (e) {
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

  const api = {
    socket,
    on: hub.on,
    off: hub.off,
    is_connected: () => socket.readyState === ReconnectingWebSocket.OPEN,
    send: (e, p) => {
      if (!api.is_connected()) throw new NotConnected()
      socket.send(JSON.stringify({ e: `${event_prefix}${e}`, p }))
    },
    call: (c, p) => {
      if (!api.is_connected()) throw new NotConnected()
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
    },
    register: (name, fn) => registry.set(name, fn),
    unregister: name => registry.delete(name),
    close: () => socket.close()
  }

  return api
}
