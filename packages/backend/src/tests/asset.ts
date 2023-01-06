import { randomInt } from 'crypto'

// Use unique assets as a workaround for not being able to reset
// Tigerbeetle between tests
export function randomAsset(): { code: string; scale: number } {
  const letters: number[] = []
  while (letters.length < 3) {
    letters.push(randomInt(65, 91))
  }
  return {
    code: String.fromCharCode(...letters),
    scale: randomInt(0, 256)
  }
}

export function randomLedger(): number {
  return randomInt(2 ** 16)
}
