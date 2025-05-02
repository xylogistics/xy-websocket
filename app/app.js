// A structure to manage application and agent state
export default global_ctx => {
  const app_by_id = new Map()

  const create = async ({ app_id, auth_token, connect_url }) => {
    const agent_by_id = new Map()
    const hub = global_ctx.hub.child()

    const app = {
      on: hub.on,
      off: hub.off,
      app_id,
      auth_token,
      connect_url,
      is_connected: false,
      payload: {},
      config: {},
      agent: agent_id => agent_by_id.get(agent_id),
      agents: () => Array.from(agent_by_id.values()),
      close: async () => {
        await hub.emit('close')
        app_by_id.delete(app_id)
      }
    }
    app_by_id.set(app_id, app)

    hub.on('connected', async () => (app.is_connected = true))
    hub.on('disconnected', async () => (app.is_connected = false))
    hub.on('app_config', async ({ config }) => {
      app.config = config
      for (const a of app.agents()) a.app_config = config
    })
    hub.on('app_payload', async ({ payload }) => {
      app.payload = payload
      for (const a of app.agents()) a.app_payload = payload
    })
    hub.on('agents_assert', async agents => {
      for (const a of agents) agent_by_id.set(a.agent_id, a)
    })
    hub.on('agents_delete', async agents => {
      for (const a of agents) agent_by_id.delete(a.agent_id)
    })
    hub.on('agents_config', async agents => {
      for (const a of agents) agent_by_id.get(a.agent_id).config = a.config
    })
    hub.on('agents_payload', async agents => {
      for (const a of agents) agent_by_id.get(a.agent_id).payload = a.payload
    })
    hub.on('agents_app_status', async agents => {
      for (const a of agents)
        agent_by_id.get(a.agent_id).app_status = a.app_status
    })
    hub.on('agents_core_status', async agents => {
      for (const a of agents)
        agent_by_id.get(a.agent_id).core_status = a.core_status
    })

    const ctx = { ...global_ctx, app, hub }

    for (const use of global_ctx.app_use)
      await use(async m => Object.assign(ctx, await m(ctx)))

    return app
  }

  return {
    app: {
      create,
      app: id => app_by_id.get(id)
    }
  }
}
