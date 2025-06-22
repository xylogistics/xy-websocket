import short from 'short-uuid'
import Websocket from 'ws'
import { backOff } from 'exponential-backoff'
import { Hub } from './hub.js'
import { NotConnected, CallWaitTimeout } from './exceptions.js'

const delay = (fn, ms = 0) => setTimeout(fn, ms)

export default ({
  url,
  call_timeout = 5000,
  protocol = {
    event_prefix: 'e.',
    call_prefix: 'c.',
    resolve_prefix: 'resolve.',
    reject_prefix: 'reject.'
  },
  wsOptions = {}
} = {}) => {
  const { event_prefix, call_prefix, resolve_prefix, reject_prefix } = protocol
  const hub = Hub()
  let socket = null
  let is_closed = false
  const registry = new Map()
  const call_promise = new Map()

  const listeners = {
    close: e => hub.emit('disconnected', e),
    error: e => hub.emit('error', e),
    open: e => hub.emit('connected', e),
    message: async e => {
      const { e: event, p: payload, id } = JSON.parse(e.data)
      if (event.startsWith(event_prefix)) return hub.emit(event.slice(event_prefix.length), payload)
      if (event.startsWith(call_prefix)) {
        const fn_name = event.slice(call_prefix.length)
        if (!registry.has(fn_name))
          return socket.send(
            JSON.stringify({
              e: `${reject_prefix}${fn_name}`,
              id,
              p: {
                ok: false,
                status: 404,
                message: `'${fn_name}' not found`
              }
            })
          )
        try {
          const result = await registry.get(fn_name)(payload)
          return socket.send(JSON.stringify({ e: `${resolve_prefix}${fn_name}`, id, p: result }))
        } catch (e) {
          if (e.ok !== false) hub.emit('error', e)
          const p = e.ok === false ? e : { ok: false, status: 500, message: `${e.name}: ${e.message}` }
          return socket.send(JSON.stringify({ e: `${reject_prefix}${fn_name}`, id, p }))
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
          reject(payload)
        }
      }
    }
  }

  const connect = async () => {
    let resolve = null
    let reject = null
    const result = new Promise((res, rej) => {
      resolve = res
      reject = rej
    })
    delay(() => {
      const newSocket = new Websocket(url, wsOptions)
      const onerror = () => {
        if (!reject) return
        const cb = reject
        resolve = null
        reject = null
        cb()
      }
      newSocket.addEventListener('close', onerror)
      newSocket.addEventListener('error', onerror)
      newSocket.addEventListener('open', e => {
        if (!resolve) return
        const cb = resolve
        resolve = null
        reject = null
        newSocket.removeAllListeners()
        for (const [event, listener] of Object.entries(listeners)) newSocket.addEventListener(event, listener)
        delay(() => hub.emit('connected', e))
        cb(newSocket)
      })
    })
    return result
  }
  const attempt = async () => {
    if (is_closed) return
    socket = await backOff(() => connect(), {
      delayFirstAttempt: true,
      numOfAttempts: Infinity,
      maxDelay: 10000
    })
    socket.addEventListener('close', attempt)
  }
  delay(attempt)

  const api = {
    socket,
    on: hub.on,
    off: hub.off,
    is_connected: () => socket != null && socket.readyState === Websocket.OPEN,
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
    close: () => {
      is_closed = true
      if (socket) {
        socket.close()
        socket = null
      }
    }
  }

  return api
}
