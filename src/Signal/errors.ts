export class SignalError extends Error {}

export class UntrustedIdentityKeyError extends SignalError {
  constructor(public readonly addr: string, public readonly identityKey: string) {
    super();
    this.name = 'UntrustedIdentityKeyError';
  }
}

export class SessionError extends SignalError {
  constructor(public readonly message: string) {
    super(message);
    this.name = 'SessionError';
  }
}

export class MessageCounterError extends SessionError {
  constructor(message: string) {
    super(message);
    this.name = 'MessageCounterError';
  }
}

export class PreKeyError extends SessionError {
  constructor(message: string) {
    super(message);
    this.name = 'PreKeyError';
  }
}