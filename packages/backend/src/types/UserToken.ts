export interface UserToken {
  iat: number
  exp: number
  userId: string
  userPermanentId: string // TODO add validation this exists
}
