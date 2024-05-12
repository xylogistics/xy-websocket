class NotConnected extends Error {
  constructor (message) {
    super(message)
    this.name = this.constructor.name
    if (Error.captureStackTrace)
      Error.captureStackTrace(this, this.constructor)
  }
}

class CallWaitTimeout extends Error {
  constructor (message) {
    super(message)
    this.name = this.constructor.name
    if (Error.captureStackTrace)
      Error.captureStackTrace(this, this.constructor)
  }
}

export {
  NotConnected,
  CallWaitTimeout
}