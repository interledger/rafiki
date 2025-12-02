/* eslint-disable @typescript-eslint/no-explicit-any */
import { PaymentError } from '..'
import { StreamRequest, StreamReply, RequestBuilder } from '../request'

/**
 * Controllers orchestrate when packets are sent, their amounts, and data.
 * Each controller implements its own business logic to handle a different part of the payment or STREAM protocol.
 */
export interface StreamController {
  /**
   * Controllers iteratively construct the next request and signal the status of the request attempt:
   * - `RequestState.Ready`    -- ready to apply and send this request,
   * - `RequestState.Error`    -- to immediately end the send loop with an error,
   * - `RequestState.Schedule` -- to cancel this request attempt and try again at a later time,
   * - `RequestState.Yield`    -- to cancel this request attempt and not directly schedule another.
   *
   * If any controller does not signal `Ready`, that request attempt will be cancelled.
   *
   * Note: since subsequent controllers may change the request or cancel it,
   * no side effects should be performed here.
   *
   * @param request Proposed ILP Prepare and STREAM request
   */
  buildRequest?(request: RequestBuilder): RequestState

  /**
   * Apply side effects before sending an ILP Prepare over STREAM. Return a callback function to apply
   * side effects from the corresponding ILP Fulfill or ILP Reject and STREAM reply.
   *
   * `applyRequest` is called for all controllers synchronously when the sending controller queues the
   * request to be sent.
   *
   * The returned reply handler may also return an error to immediately end the send loop.
   *
   * @param request Finalized amounts and data of the ILP Prepare and STREAM request
   */
  applyRequest?(
    request: StreamRequest
  ): ((reply: StreamReply) => PaymentError | void) | undefined
}

export enum SendStateType {
  /** Finish send loop successfully */
  Done,
  /** Finish send loop with an error */
  Error,
  /** Schedule another request attempt later. If applicable, cancels current attempt */
  Schedule,
  /** Do not schedule another attempt. If applicable, cancels current attempt */
  Yield,
  /** Ready to send and apply a request */
  Ready,
  /** Commit to send and apply the request */
  Send
}

/** States each controller may signal when building the next request */
export type RequestState = Error | Schedule | Yield | Ready

/** States the sender may signal to determine the next state of the send loop */
export type SendState<T> = Error | Schedule | Yield | Send<T> | Done<T>

type Error = {
  type: SendStateType.Error
  value: PaymentError
}

/** Immediately end the loop and payment with an error. */
const Error = (error: PaymentError): Error => ({
  type: SendStateType.Error,
  value: error
})

type Schedule = {
  type: SendStateType.Schedule
  delay: Promise<any>
}

/**
 * Schedule another request attempt after the delay, or as soon as possible if
 * no delay was provided.
 */
const Schedule = (delay?: Promise<any>): Schedule => ({
  type: SendStateType.Schedule,
  delay: delay ?? Promise.resolve()
})

type Yield = {
  type: SendStateType.Yield
}

/** Don't immediately schedule another request attempt. If applicable, cancel the current attempt. */
const Yield = (): Yield => ({ type: SendStateType.Yield })

type Done<T> = {
  type: SendStateType.Done
  value: T
}

/** Immediately resolve the send loop as successful. */
const Done = <T>(value: T): Done<T> => ({
  type: SendStateType.Done,
  value
})

type Ready = {
  type: SendStateType.Ready
}

/** Ready for this request to be immediately applied and sent. */
const Ready = (): Ready => ({
  type: SendStateType.Ready
})

type Send<T> = {
  type: SendStateType.Send
  applyReply: (reply: StreamReply) => Done<T> | Schedule | Yield | Error
}

/**
 * Apply and send the request.
 *
 * @param applyReply Callback to apply side effects from the reply, called synchronously after all other
 * controllers' reply handlers. The handler may resolve the the send loop, return an error, or re-schedule an attempt.
 */
const Send = <T>(
  applyReply: (reply: StreamReply) => Done<T> | Schedule | Yield | Error
): Send<T> => ({
  type: SendStateType.Send,
  applyReply
})

export const RequestState = {
  Ready,
  Error,
  Schedule,
  Yield
}

export const SendState = {
  Done,
  Error,
  Schedule,
  Yield,
  Send
}
