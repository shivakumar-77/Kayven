import { createHmac } from 'crypto'

export const crypto = {
  createHmac: (algorithm: string, key: string) => createHmac(algorithm, key)
}
