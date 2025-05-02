// Map the app host's koa router into the application's koa router
class DuplicateKoaUrlPattern extends Error {
  constructor(message) {
    super(message)
    this.name = this.constructor.name
    if (Error.captureStackTrace) Error.captureStackTrace(this, this.constructor)
  }
}

export default async ({ koa: { router }, app_use }) => {
  const registeredPatterns = new Set()
  const handlerByAppIdByVerbAndPattern = new Map()

  const assertPattern = (verb, pattern) => {
    if (registeredPatterns.has(pattern)) return
    const verbAndPattern = `${verb} ${pattern}`
    router[verb](`/:app_id${pattern}`, async ctx => {
      const app_id = ctx.params.app_id
      if (!handlerByAppIdByVerbAndPattern.has(app_id)) return
      const handlerByVerbAndPattern = handlerByAppIdByVerbAndPattern.get(app_id)
      if (!handlerByVerbAndPattern.has(verbAndPattern)) return
      const handler = handlerByVerbAndPattern.get(verbAndPattern)
      await handler(ctx)
    })
  }

  const registerAppPattern = (app, verb, pattern, handler) => {
    assertPattern(verb, pattern)
    if (!handlerByAppIdByVerbAndPattern.has(app.app_id))
      handlerByAppIdByVerbAndPattern.set(app.app_id, new Map())
    const handlerByVerbAndPattern = handlerByAppIdByVerbAndPattern.get(
      app.app_id
    )
    const verbAndPattern = `${verb} ${pattern}`
    if (handlerByVerbAndPattern.has(verbAndPattern))
      throw new DuplicateKoaUrlPattern()
    handlerByVerbAndPattern.set(verbAndPattern, handler)
  }

  const createAppRouter = app => {
    const api = {
      get: (pattern, handler) =>
        registerAppPattern(app, 'get', pattern, handler),
      post: () => registerAppPattern(app, 'post', pattern, handler)
    }

    return api
  }

  app_use.push(async ({ app }) => {
    return { koa: { router: createAppRouter(app) } }
  })
}

export { DuplicateKoaUrlPattern }
