/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  StreamController,
  SendState,
  SendStateType,
  RequestState
} from '../controllers'
import {
  RequestBuilder,
  generateKeys,
  StreamRequest,
  StreamReply
} from '../request'
import { isPaymentError, PaymentError } from '..'
import { PaymentDestination } from '../open-payments'
import createLogger, { Logger } from 'ilp-logger'
import { Plugin } from '../request'
import { sha256 } from '../utils'

/**
 * Orchestrates all business rules to schedule and send a series of ILP/STREAM requests
 * to one unique destination.
 *
 * Sends and commits each request, and tracks completion criteria to
 * resolve the send loop to its own value.
 *
 * While other controllers hold "veto" power over individual request attempts,
 * only the sender explicitly commits to sending each request.
 */
export abstract class StreamSender<T> {
  /** Queue for side effects from requests */
  private readonly requestScheduler = new Scheduler<() => SendState<T>>()

  /** Queue for side effects from replies */
  private readonly replyScheduler = new Scheduler<() => SendState<T>>()

  /** Send an ILP Prepare over STREAM, then parse and authenticate the reply */
  private readonly sendRequest: (request: StreamRequest) => Promise<StreamReply>

  /** Order of STREAM controllers to iteratively build a request or cancel the attempt */
  protected abstract readonly controllers: StreamController[]

  /**
   * Track completion criteria to finalize and send this request attempt,
   * end the send loop, or re-schedule.
   *
   * Return state of the send loop:
   * - `SendState.Send`     -- to send the request, applying side effects through all controllers in order,
   * - `SendState.Done`     -- to resolve the send loop as successful,
   * - `SendState.Error`    -- to end send loop with an error,
   * - `SendState.Schedule` -- to cancel this request attempt and try again at a later time,
   * - `SendState.Yield`    -- to cancel this request attempt and not directly schedule another.
   *
   * @param request Proposed ILP Prepare and STREAM request
   * @param lookup Lookup or create an instance of another controller. Each connection instantiates a single controller per constructor
   */
  protected abstract nextState(request: RequestBuilder): SendState<T>

  /** Logger namespaced to this connection */
  readonly log: Logger

  constructor(plugin: Plugin, destinationDetails: PaymentDestination) {
    const { destinationAddress, sharedSecret } = destinationDetails

    const connectionId = sha256(Buffer.from(destinationAddress))
      .toString('hex')
      .slice(0, 6)
    this.log = createLogger(`ilp-pay:${connectionId}`)

    this.sendRequest = generateKeys(plugin, sharedSecret)
  }

  private trySending(): SendState<T> {
    const request = new RequestBuilder({ log: this.log })
    const requestState = [...this.controllers.values()].reduce<RequestState>(
      (state, controller) =>
        state.type === SendStateType.Ready
          ? controller.buildRequest?.(request) ?? state
          : state,
      RequestState.Ready()
    )
    if (requestState.type !== SendStateType.Ready) {
      return requestState // Cancel this attempt
    }

    // If committing and sending this request, continue
    const state = this.nextState(request)
    if (state.type !== SendStateType.Send) {
      return state // Cancel this attempt
    }

    // Synchronously apply the request
    const replyHandlers = this.controllers.map((c) => c.applyRequest?.(request))

    // Asynchronously send the request and queue the reply side effects as another task
    const task = this.sendRequest(request).then((reply) => () => {
      // Apply side effects from all controllers and StreamSender, then return the first error or next state
      // (For example, even if a payment error occurs in a controller, it shouldn't return
      //  immediately since that packet still needs to be correctly accounted for)
      const error = replyHandlers
        .map((apply) => apply?.(reply))
        .find(isPaymentError)
      const newState = state.applyReply(reply)
      return error ? SendState.Error(error) : newState
    })

    this.replyScheduler.queue(task)

    return SendState.Schedule() // Schedule another attempt immediately
  }

  /**
   * Send a series of requests, initiated by the given STREAM sender,
   * until it completes its send loop or a payment error is encountered.
   *
   * Only one send loop can run at a time. A STREAM connection
   * may run successive send loops for different functions or phases.
   */
  async start(): Promise<T | PaymentError> {
    // Queue initial attempt to send a request
    this.requestScheduler.queue(Promise.resolve(this.trySending.bind(this)))

    for (;;) {
      const applyEffects = await Promise.race([
        this.replyScheduler.next(),
        this.requestScheduler.next()
      ])
      const state = applyEffects()

      switch (state.type) {
        case SendStateType.Done:
        case SendStateType.Error:
          await this.replyScheduler.complete() // Wait to process outstanding requests
          return state.value

        case SendStateType.Schedule:
          this.requestScheduler.queue(
            state.delay.then(() => this.trySending.bind(this))
          )
      }
    }
  }
}

/**
 * Task scheduler: a supercharged `Promise.race`.
 *
 * Queue "tasks", which are Promises resolving with a function. The scheduler aggregates
 * all pending tasks, where `next()` resolves to the task which resolves first. Critically,
 * this also *includes any tasks also queued while awaiting the aggregate Promise*.
 * Then, executing the resolved function removes the task, so the remaining
 * pending tasks can also be aggregated and awaited.
 */
class Scheduler<T extends (...args: any[]) => any> {
  /** Set of tasks yet to be executed */
  private pendingTasks = new Set<Promise<T>>()

  /**
   * Resolves to the task of the first event to resolve.
   * Replaced with a new tick each time a task is executed
   */
  private nextTick = new PromiseResolver<T>()

  /**
   * Resolve to the pending task which resolves first, including existing tasks
   * and any added after this is called.
   */
  next(): Promise<T> {
    this.nextTick = new PromiseResolver<T>()
    this.pendingTasks.forEach((task) => {
      this.resolveTick(task)
    })

    return this.nextTick.promise
  }

  /**
   * Execute all pending tasks immediately when they resolve,
   * then resolve after all have resolved.
   */
  async complete(): Promise<any> {
    return Promise.all(
      [...this.pendingTasks].map((promise) => promise.then((run) => run()))
    )
  }

  /** Schedule a task, which is Promise resolving to a function to execute */
  queue(task: Promise<T>): void {
    this.pendingTasks.add(task)
    this.resolveTick(task)
  }

  /**
   * Resolve the current tick when the given task resolves. Wrap
   * the task's function to remove it as pending if it's executed.
   */
  private async resolveTick(task: Promise<T>): Promise<void> {
    const run = await task
    this.nextTick.resolve(<T>((...args: Parameters<T>): ReturnType<T> => {
      this.pendingTasks.delete(task)
      return run(...args)
    }))
  }
}

/** Promise that can be resolved or rejected outside its executor callback. */
class PromiseResolver<T> {
  resolve!: (value: T) => void
  reject!: () => void
  readonly promise = new Promise<T>((resolve, reject) => {
    this.resolve = resolve
    this.reject = reject
  })
}
