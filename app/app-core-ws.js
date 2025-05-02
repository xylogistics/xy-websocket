// Create an application's connection to the core
import createClient from '../client.js'

export default ({ app_host_id }) =>
  async ({ hub, app }) => {
    console.log(`${app.app_id} connecting to ${app.connect_url}`)
    const core_ws_client = createClient({
      url: app.connect_url,
      wsOptions: {
        finishRequest: req => {
          req.setHeader('Authorization', `Bearer ${app.auth_token}`)
          req.end()
        },
        followRedirects: true
      }
    })
    app.core_ws_client = core_ws_client
    core_ws_client.on('connected', async () => {
      console.log('Amtech Kiosk API Connected', app.app_id)
      hub.emit('connected')
      const result = await core_ws_client.call('/app/app_register', {})
      hub.emit('config', result)
      hub.emit('payload', result)
      // Set app_host_id for ownership
      if (result.config.app_host_id != app_host_id)
        core_ws_client.call('/app/app_config', {
          app_id: app.app_id,
          config: { ...result.config, app_host_id }
        })
      for (const a of result.agents) {
        a.app_config = result.config
        a.app_payload = result.payload
      }
      hub.emit('agents_assert', result.agents)
      hub.emit(
        'agents_connected',
        result.agents.map(a => ({
          agent_id: a.agent_id,
          is_connected: app.agent_socket(a.agent_id)
        }))
      )
    })

    const relay = (e1, e2) =>
      core_ws_client.on(e1, params => hub.emit(e2, params))

    relay('/app/app_config', 'app_config')
    relay('/app/app_payload', 'app_payload')
    relay('/app/agents_assert', 'agents_assert')
    relay('/app/agents_delete', 'agents_delete')
    relay('/app/agents_config', 'agents_config')
    relay('/app/agents_payload', 'agents_payload')
    relay('/app/agents_app_status', 'agents_app_status')
    relay('/app/agents_core_status', 'agents_core_status')
    relay('disconnected', 'disconnected')

    hub.on('agent connected', async ({ agent }) => {
      if (!core_ws_client.is_connected) return
      core_ws_client.call('/app/agents_connected', [
        {
          agent_id: agent.agent_id,
          is_connected: true
        }
      ])
    })

    hub.on('agent disconnected', async ({ agent }) => {
      if (!core_ws_client.is_connected) return
      core_ws_client.call('/app/agents_connected', [
        {
          agent_id: agent.agent_id,
          is_connected: false
        }
      ])
    })

    hub.on('close', async () => {
      core_ws_client.close()
    })

    return { core_ws_client }
  }
