import { randomBytes, createCipheriv, createDecipheriv } from 'crypto'
import logger from './logger'
import { generateKeyPairSync } from 'node:crypto'

/**
 * The AES Local Master Key for the ILF HSM.
 */
const AES_ILF_LMK_HEX =
  '00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff'
/**
 * The AES Local Master Key for the KaiOS HSM.
 */
const AES_KAI_LMK_HEX =
  'ffeeddccbbaa99887766554433221100ffeeddccbbaa99887766554433221100'
/**
 * The AES Local Master Key for the Austria Card HSM.
 */
const AES_AUSTRIA_CARD_LMK_HEX =
  'eeeeddccbbaa99887766554433221100ffeeddccbbaa99887766554433222211'

enum KeyUsage {
  ZMK,
  TMK,
  DEK,
  BDK
}

enum Tr31Intent {
  LMK,
  ZMK
}

// XOR two buffers
function xorBuffers(buf1: Buffer, buf2: Buffer): Buffer {
  if (buf1.length !== buf2.length) {
    throw new Error('Buffers must be the same length for XOR')
  }
  const result = Buffer.alloc(buf1.length)
  for (let i = 0; i < buf1.length; i++) {
    result[i] = buf1[i] ^ buf2[i]
  }
  return result
}

// Generate 3DES key from 3 components (each 24 bytes)
function generate3DESKeyFromComponents(): {
  component1: string
  component2: string
  component3: string
  finalKey: string
  finalKeyBuffer: Buffer
  kcv: string
} {
  const length = 24 // 3DES key length (3 x 8 bytes = 24 bytes)

  const keyComponent1 = randomBytes(length)
  const keyComponent2 = randomBytes(length)
  const keyComponent3 = randomBytes(length)

  // Combine via XOR
  const tempXor = xorBuffers(keyComponent1, keyComponent2)
  const finalKey = xorBuffers(tempXor, keyComponent3)

  logger.info('Key Component 1:', keyComponent1.toString('hex'))
  logger.info('Key Component 2:', keyComponent2.toString('hex'))
  logger.info('Key Component 3:', keyComponent3.toString('hex'))
  logger.info('Final 3DES Key :', finalKey.toString('hex'))

  return {
    component1: keyComponent1.toString('hex').toUpperCase(),
    component2: keyComponent2.toString('hex').toUpperCase(),
    component3: keyComponent3.toString('hex').toUpperCase(),
    finalKey: finalKey.toString('hex').toUpperCase(),
    finalKeyBuffer: finalKey,
    kcv: obtainKCVFrom3DESKey(finalKey)
  }
}

function import3DESKeyFromComponents(
  kekHex: string,
  keyUsage: KeyUsage,
  component1: string,
  component2: string,
  component3: string,
  kcv?: string
): {
  finalKey: string
  finalKeyBuffer: Buffer
  tr31KeyBlock: string
  iv: Buffer
  kcv: string
} {
  const keyComponent1 = Buffer.from(component1, 'hex')
  const keyComponent2 = Buffer.from(component2, 'hex')
  const keyComponent3 = Buffer.from(component3, 'hex')

  // Combine via XOR
  const tempXor = xorBuffers(keyComponent1, keyComponent2)
  const finalKey = xorBuffers(tempXor, keyComponent3)
  const finalKeyKcv = obtainKCVFrom3DESKey(finalKey)
  if (kcv && kcv !== finalKeyKcv) {
    throw new Error(`Expected KCV '${kcv}' but got '${finalKeyKcv}' instead.`)
  }

  const { iv, tr31Block } = createTR31KeyBlockUnder(
    Tr31Intent.LMK,
    kekHex,
    keyUsage,
    'T', //T for TDEA, A for AES
    finalKey
  )

  return {
    finalKey: finalKey.toString('hex').toUpperCase(),
    finalKeyBuffer: finalKey,
    tr31KeyBlock: tr31Block.toString('ascii').toUpperCase(),
    iv,
    kcv: finalKeyKcv
  }
}

function generateTMK(
  lmk: string,
  tr31ZmkUnderLmk: string
): {
  tr31TmkUnderLmk: string
  tr31TmkUnderZmk: string
  kcv: string
} {
  const { clearKeyHex } = extractClearKeyFromTR31KeyBlock(
    Tr31Intent.LMK,
    lmk,
    tr31ZmkUnderLmk
  )

  const tmkRaw = randomBytes(24)
  const tmkKCV = obtainKCVFrom3DESKey(tmkRaw)

  const tr31TmkUnderLmk = createTR31KeyBlockUnder(
    Tr31Intent.LMK,
    lmk,
    KeyUsage.TMK,
    'T',
    tmkRaw
  )
  const tr31TmkUnderZmk = createTR31KeyBlockUnder(
    Tr31Intent.ZMK,
    clearKeyHex, //ZMK
    KeyUsage.TMK,
    'T',
    tmkRaw
  )

  return {
    tr31TmkUnderLmk: tr31TmkUnderLmk.tr31Block.toString('ascii'),
    tr31TmkUnderZmk: tr31TmkUnderZmk.tr31Block.toString('ascii'),
    kcv: tmkKCV
  }
}

function importTMK(
  lmkHex: string,
  tr31ZmkUnderLmk: string,
  tr31TmkUnderZmk: string,
  kcv?: string
): {
  tr31TmkUnderLmk: string
  kcv: string
} {
  // 1. Obtain the clear ZMK key from the ZMK under LMK:
  const clearZmkKey = extractClearKeyFromTR31KeyBlock(
    Tr31Intent.LMK,
    lmkHex,
    tr31ZmkUnderLmk
  )

  // 2. Obtain the clear TMK key:
  const clearTmkKey = extractClearKeyFromTR31KeyBlock(
    Tr31Intent.ZMK,
    clearZmkKey.clearKeyHex,
    tr31TmkUnderZmk
  )
  if (kcv && kcv !== clearTmkKey.kcv) {
    throw new Error(
      `Expected KCV '${kcv}' but got '${clearTmkKey.kcv}' instead.`
    )
  }

  const tmkUnderLmk = createTR31KeyBlockUnder(
    Tr31Intent.LMK,
    lmkHex,
    KeyUsage.TMK,
    'T',
    clearTmkKey.clearKey
  )

  return {
    kcv: clearTmkKey.kcv,
    tr31TmkUnderLmk: tmkUnderLmk.tr31Block.toString('ascii')
  }
}

function generateCardKey(
  lmk: string,
  tr31ZmkUnderLmk: string,
  //keySize: number = 2048,
  passphrase: string = 'your-secure-passphrase'
): {
  tr31CardKeyUnderLmk: string
  tr31CardKeyUnderZmk: string
  publicKey: string
  kcv: string
} {
  // EllipticCurve: prime256v1
  const { publicKey, privateKey } = generateKeyPairSync('ec', {
    //modulusLength: keySize, // Key size in bits (RSA/DSA)
    namedCurve: 'prime256v1',
    publicKeyEncoding: {
      type: 'spki', // Recommended for public keys
      format: 'pem' //pem for string, der for buffer.
    },
    privateKeyEncoding: {
      type: 'pkcs8', // Recommended for private keys
      format: 'der',
      cipher: 'aes-256-cbc', // Optional encryption
      passphrase // Optional passphrase
    }
  })

  logger.info(
    `Private key size is ${privateKey.length} bytes, and public key size is ${publicKey.length} bytes`
  )

  const tr31CardKeyUnderLmk = createTR31KeyBlockUnder(
    Tr31Intent.LMK,
    lmk,
    KeyUsage.DEK,
    'T',
    privateKey
  )

  const { clearKeyHex } = extractClearKeyFromTR31KeyBlock(
    Tr31Intent.LMK,
    lmk,
    tr31ZmkUnderLmk
  )
  const tr31CardKeyUnderZmk = createTR31KeyBlockUnder(
    Tr31Intent.ZMK,
    clearKeyHex, //ZMK
    KeyUsage.DEK,
    'T',
    privateKey
  )

  //TODO Test:
  const pvtKey = extractClearKeyFromTR31KeyBlock(
    Tr31Intent.LMK,
    lmk,
    tr31CardKeyUnderLmk.tr31Block.toString('ascii')
  )

  logger.info(`Private key [BACK] size is ${pvtKey.clearKey.length} bytes.`)

  return {
    tr31CardKeyUnderLmk: tr31CardKeyUnderLmk.tr31Block.toString('ascii'),
    tr31CardKeyUnderZmk: tr31CardKeyUnderZmk.tr31Block.toString('ascii'),
    publicKey,
    kcv: 'XXXXXX'
  }
}

function obtainKCVFrom3DESKey(key: Buffer): string {
  const data = Buffer.alloc(8, 0x00) // 8 bytes of zeros
  const cipher = createCipheriv('des-ede3', key, null)
  const encrypted = Buffer.concat([cipher.update(data), cipher.final()])
  return encrypted.slice(0, 3).toString('hex').toUpperCase() // First 3 bytes
}

function encryptWithAES256(
  plaintext: Buffer,
  aesKeyHex: string,
  zeroIv: boolean = true
): { iv: Buffer; ciphertext: Buffer; ciphertextHex: string } {
  if (aesKeyHex.length !== 64)
    throw new Error('AES key must be 64 hex characters (256 bits / 32 bytes)')

  const key = Buffer.from(aesKeyHex, 'hex')
  const iv = zeroIv ? Buffer.alloc(16) : randomBytes(16) // AES block size = 16 bytes

  const cipher = createCipheriv('aes-256-cbc', key, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()])

  return {
    iv,
    ciphertext: encrypted,
    ciphertextHex: encrypted.toString('hex')
  }
}

function encryptWith3DES(
  plaintext: Buffer,
  keyHex: string,
  zeroIv: boolean = true
): { iv: Buffer; ciphertext: Buffer; ciphertextHex: string } {
  if (keyHex.length !== 48)
    throw new Error('3DES key must be 48 hex characters (24 bytes)')

  const key = Buffer.from(keyHex, 'hex')
  const iv = zeroIv ? Buffer.alloc(8) : randomBytes(8) // 3DES block size = 8 bytes

  const cipher = createCipheriv('des-ede3-cbc', key, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()])

  return {
    iv,
    ciphertext: encrypted,
    ciphertextHex: encrypted.toString('hex')
  }
}

function decryptWithAES256(
  ciphertext: Buffer,
  aesKeyHex: string,
  iv: Buffer
): Buffer {
  if (aesKeyHex.length !== 64)
    throw new Error('AES key must be 64 hex characters (256 bits / 32 bytes)')
  if (iv.length !== 16) throw new Error('IV must be 16 bytes (128 bits)')

  const key = Buffer.from(aesKeyHex, 'hex')
  const decipher = createDecipheriv('aes-256-cbc', key, iv)
  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final()
  ])
  return decrypted
}

function decryptWith3DES(
  ciphertext: Buffer,
  keyHex: string,
  iv: Buffer
): Buffer {
  if (keyHex.length !== 48)
    throw new Error('3DES key must be 48 hex characters (24 bytes)')
  if (iv.length !== 8) throw new Error('IV must be 8 bytes (64 bits)')

  const key = Buffer.from(keyHex, 'hex')
  const decipher = createDecipheriv('des-ede3-cbc', key, iv)
  return Buffer.concat([decipher.update(ciphertext), decipher.final()])
}

function createTR31KeyBlockUnder(
  intent: Tr31Intent,
  kekHex: string, // 32-byte AES key (hex-encoded)
  keyUsage: KeyUsage, // 3 chars, e.g., 'EK' for Encryption Key
  keyType: string, // 1 char, e.g., 'T' for TDEA, 'A' for AES
  key: Buffer, // Key material (e.g., 24 bytes for 3DES)
  zeroIv: boolean = true
): { iv: Buffer; tr31Block: Buffer } {
  if (intent == Tr31Intent.LMK && kekHex.length !== 64)
    throw new Error('KEK (LMK) must be 64 hex chars (32 bytes)')
  else if (intent == Tr31Intent.ZMK && kekHex.length !== 48)
    throw new Error('KEK (ZMK) must be 48 hex chars (24 bytes)')

  // for data, we convert to ASCII-HEX:
  if (keyUsage === KeyUsage.DEK) key = Buffer.from(key.toString('hex'))

  // Encrypt using AES-256-CBC
  const encryptedKey =
    intent == Tr31Intent.LMK
      ? encryptWithAES256(key, kekHex, zeroIv)
      : encryptWith3DES(key, kekHex, zeroIv)

  const encryptedKeyHex = encryptedKey.ciphertextHex.toUpperCase()

  // TR-31 Header – 16 bytes (simplified)
  const version = intent == Tr31Intent.LMK ? 'S' : 'B' // 1 byte: Version ID
  const reserved = '0' // 1 byte: Reserved
  const usage = `${KeyUsage[keyUsage]}` // 3 bytes: Key Usage (e.g., 'ZMK' / 'DEK')
  const algo = keyType // 1 byte: Key Algorithm ID ('T' for 3DES)
  const exportFlag = 'N' // 1 byte: Export flag
  const numComponents = '1' // 1 byte: Key components (assume 1)
  const generationMethod = 'K' // 1 byte: Key generation method
  const length = encryptedKeyHex.length.toString().padStart(4, '0') // 4 bytes: Key length
  const reserved2 = '000000000' // 9 bytes reserved

  const headerStr =
    version +
    reserved +
    usage +
    algo +
    exportFlag +
    numComponents +
    generationMethod +
    length +
    reserved2
  const header = Buffer.from(headerStr, 'ascii') // total 16 bytes
  const kcv = keyUsage === KeyUsage.DEK ? 'XXXXXX' : obtainKCVFrom3DESKey(key)

  // Combine header and key
  const tr31Block = Buffer.concat([
    header,
    Buffer.from(encryptedKeyHex),
    Buffer.from(kcv)
  ])

  return {
    iv: encryptedKey.iv,
    tr31Block
  }
}

function extractClearKeyFromTR31KeyBlock(
  intent: Tr31Intent,
  kekHex: string,
  tr31: string
): {
  clearKey: Buffer
  clearKeyHex: string
  kcv: string
} {
  const keyLength = parseInt(tr31.substring(9, 13))
  const usage = KeyUsage[tr31.substring(2, 5) as keyof typeof KeyUsage]
  const key = tr31.substring(22, 22 + keyLength)
  const tr31EncKeyPortion = Buffer.from(key, 'hex')
  let clearKey =
    intent === Tr31Intent.LMK
      ? decryptWithAES256(tr31EncKeyPortion, kekHex, Buffer.alloc(16))
      : decryptWith3DES(tr31EncKeyPortion, kekHex, Buffer.alloc(8))
  if (usage == KeyUsage.DEK)
    clearKey = Buffer.from(clearKey.toString('ascii'), 'hex')

  const tr31Kcv = tr31.slice(-6)
  const kcvComputed =
    usage == KeyUsage.DEK ? 'XXXXXX' : obtainKCVFrom3DESKey(clearKey)
  if (kcvComputed !== tr31Kcv) {
    throw new Error(
      `Expected KCV '${tr31Kcv}' but got '${kcvComputed}'. Please confirm correct KEK is used.`
    )
  }

  return {
    clearKey: clearKey,
    clearKeyHex: clearKey.toString('hex'),
    kcv: kcvComputed
  }
}

export {
  generate3DESKeyFromComponents,
  import3DESKeyFromComponents,
  obtainKCVFrom3DESKey,
  createTR31KeyBlockUnder,
  generateTMK,
  importTMK,
  generateCardKey,
  AES_ILF_LMK_HEX,
  AES_KAI_LMK_HEX,
  AES_AUSTRIA_CARD_LMK_HEX,
  KeyUsage,
  Tr31Intent
}
