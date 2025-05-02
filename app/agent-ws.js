// Agent registration and admin ws calls
class UnknownAgent extends Error {
  constructor(message) {
    super(message)
    this.name = this.constructor.name
    if (Error.captureStackTrace) Error.captureStackTrace(this, this.constructor)
  }
}

class AlreadyConnected extends Error {
  constructor(message) {
    super(message)
    this.name = this.constructor.name
    if (Error.captureStackTrace) Error.captureStackTrace(this, this.constructor)
  }
}

export default async ({ agent_ws_shim, hub, app }) => {
  // Keep track of connected agents
  const agentsocket_byid = new Map()
  hub.on('agent connected', async ({ agent, socket }) => {
    agentsocket_byid.set(agent.agent_id, socket)
  })
  hub.on('agent disconnected', async ({ agent }) => {
    agentsocket_byid.delete(agent.agent_id)
  })
  app.agent_socket = agent_id => agentsocket_byid.get(agent_id)

  // Listen for events from the core and send them to the agent
  hub.on('app_config', async ({ config }) => {
    for (const { agent_id } of app.agents()) {
      const socket = app.agent_socket(agent_id)
      if (!socket) continue
      socket.sendEvent('app_config', { config })
    }
  })
  hub.on('app_payload', async ({ payload }) => {
    for (const { agent_id } of app.agents()) {
      const socket = app.agent_socket(agent_id)
      if (!socket) continue
      socket.sendEvent('app_payload', { payload })
    }
  })
  hub.on('agents_config', async agents => {
    for (const { agent_id, config } of agents) {
      const socket = app.agent_socket(agent_id)
      if (!socket) continue
      socket.sendEvent('agent_config', { config })
    }
  })
  hub.on('agents_payload', async agents => {
    for (const { agent_id, payload } of agents) {
      const socket = app.agent_socket(agent_id)
      if (!socket) continue
      socket.sendEvent('agent_payload', { payload })
    }
  })
  hub.on('agents_app_status', async agents => {
    for (const { agent_id, app_status } of agents) {
      const socket = app.agent_socket(agent_id)
      if (!socket) continue
      socket.sendEvent('agent_app_status', { app_status })
    }
  })
  hub.on('agents_core_status', async agents => {
    for (const { agent_id, core_status } of agents) {
      const socket = app.agent_socket(agent_id)
      if (!socket) continue
      socket.sendEvent('agent_core_status', { core_status })
    }
  })

  // Implement commands for the agent to call
  agent_ws_shim.register('/agent/register', (_, socket) => {
    const agent_id = socket.request.authorization?.agent_id
    if (!app.agent(agent_id)) throw new UnknownAgent()
    if (agentsocket_byid.has(agent_id)) throw new AlreadyConnected()
    const agent = app.agent(agent_id)
    hub.emit('agent connected', { agent, socket })
    socket.on('close', () => hub.emit('agent disconnected', { agent, socket }))
    return { agent }
  })
}
