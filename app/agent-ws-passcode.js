// Allow unauthenticated agents to get a passcode
// TODO: Rate limit this endpoint
export default ({ gen_passcode }) =>
  async ({ agent_ws_server }) => {
    agent_ws_server.register(
      '/agent/start_auth_workflow',
      async (_, socket) => {
        const passcode = gen_passcode()
        socket.passcode = passcode
        return { passcode }
      }
    )
  }
