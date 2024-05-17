import { Hub } from './hub.js'

const delay = fn => setTimeout(fn, 0)

const ws = {
  OPEN: 1,
  CONNECTING: 2,
  CLOSING: 3,
  CLOSED: 4
}

const createServer = () => {
  const serverHub = Hub()
  const sockets = []
  const serverRegistry = new Map()

  const createClient = request => {
    const socketHub = Hub()
    const clientHub = Hub()
    const clientRegistry = new Map()

    const socket = {
      on: socketHub.on,
      off: socketHub.off,
      sendEvent: (e, p) => {
        clientHub.emit(e, p)
      },
      call: async (c, p) => {
        if (!clientRegistry.has(c))
          throw new Error(`'${c}' not found`)
        return await clientRegistry.get(c)(p ?? {}, socket)
      },
      readyState: ws.OPEN,
      request
    }

    const client = {
      on: clientHub.on,
      off: clientHub.off,
      register: (name, fn) => clientRegistry.set(name, fn),
      unregister: name => clientRegistry.delete(name),
      sendEvent: (e, p) => {
        serverHub.emit(e, p)
      },
      call: async (c, p) => {
        if (!serverRegistry.has(c))
          throw new Error(`'${c}' not found`)
        return await serverRegistry.get(c)(p ?? {}, socket)
      },
      close: () => {
        socket.readyState = ws.CLOSED
        serverHub.emit('disconnected', socket)
        socketHub.emit('close')
        clientHub.emit('disconnected')
      }
    }

    delay(() => {
      serverHub.emit('connection', socket, request)
      clientHub.emit('connected', client)
    })

    return { socket, client }
  }

  const api = {
    on: serverHub.on,
    off: serverHub.off,
    emit: serverHub.emit,
    broadcast: (e, p) => {
      for (const socket of sockets) {
        if (!api.is_connected(socket)) continue
        socket.sendEvent(e, p)
      }
    },
    sockets,
    is_connected: socket => socket != null && socket.readyState === ws.OPEN,
    register: (name, fn) => serverRegistry.set(name, fn),
    unregister: name => serverRegistry.delete(name),
    close: () => {
      for (const socket of sockets)
        socket.close()
      serverHub.emit('close')
    },
    createClient: request => {
      const { client, socket } = createClient(request)
      sockets.push(socket)
      return client
    },
    OPEN: ws.OPEN,
    CONNECTING: ws.CONNECTING,
    CLOSING: ws.CLOSING,
    CLOSED: ws.CLOSED
  }

  return api
}

export default createServer