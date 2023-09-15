import { v4 } from 'uuid'

import { Config } from '../config/app'
import { Grant } from '../grant/model'
import { InteractionState } from '../interaction/model'
import { generateNonce } from '../shared/utils'

export interface GenerateBaseInteractionOptions {
  state?: InteractionState
}

export const generateBaseInteraction = (
  grant: Grant,
  options: GenerateBaseInteractionOptions = {}
) => {
  const { state = InteractionState.Pending } = options
  return {
    ref: v4(),
    nonce: generateNonce(),
    state,
    expiresIn: Config.interactionExpirySeconds,
    grantId: grant.id
  }
}
