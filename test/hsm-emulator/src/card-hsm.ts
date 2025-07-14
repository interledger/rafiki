import {
  randomBytes,
  createCipheriv,
  createDecipheriv,
  createHash,
  generateKeyPairSync
} from 'crypto'
import logger from './logger'

/**
 * The AES Local Master Key for the Customer ASE HSM.
 */
const AES_CUSTOMER_ASE_LMK_HEX =
  '00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff'

/**
 * The AES Local Master Key for the Merchant ASE HSM.
 */
const AES_MERCHANT_ASE_LMK_HEX =
  '01112233445566778899aabbccddeeff00112233445566778899aabbccddeeff'
/**
 * The AES Local Master Key for the KaiOS HSM.
 */
const AES_KAI_LMK_HEX =
  'ffeeddccbbaa99887766554433221100ffeeddccbbaa99887766554433221100'
/**
 * The AES Local Master Key for the Austria Card HSM.
 */
const AES_AUSTRIA_CARD_LMK_HEX =
  '11112233445566778899aabbccddeeff00112233446666778899aabbccddeeff'

enum KeyUsage {
  ZMK,
  TMK,
  DEK,
  BDK,
  IPK
}

enum Tr31Intent {
  LMK,
  ZMK,
  TMK
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

function generateBDK(
  lmk: string,
  tr31ZmkUnderLmk: string
): {
  tr31BdkUnderLmk: string
  tr31BdkUnderZmk: string
  kcv: string
} {
  const { clearKeyHex } = extractClearKeyFromTR31KeyBlock(
    Tr31Intent.LMK,
    lmk,
    tr31ZmkUnderLmk
  )

  const bdkRaw = randomBytes(24)
  const bdkKCV = obtainKCVFrom3DESKey(bdkRaw)

  const tr31BdkUnderLmk = createTR31KeyBlockUnder(
    Tr31Intent.LMK,
    lmk,
    KeyUsage.BDK,
    'T',
    bdkRaw
  )
  const tr31BdkUnderZmk = createTR31KeyBlockUnder(
    Tr31Intent.ZMK,
    clearKeyHex, //ZMK
    KeyUsage.BDK,
    'T',
    bdkRaw
  )

  return {
    tr31BdkUnderLmk: tr31BdkUnderLmk.tr31Block.toString('ascii'),
    tr31BdkUnderZmk: tr31BdkUnderZmk.tr31Block.toString('ascii'),
    kcv: bdkKCV
  }
}

function deriveIPEK(
  lmkHex: string,
  tr31BdkUnderLmk: string,
  tr31TmkUnderLmk: string,
  ksnHex: string
): {
  tr31IpekUnderLmk: string
  tr31IpekUnderTmk: string
  kcv: string
} {
  // 1. Obtain the clear BDK key from the LMK:
  const clearBdkKey = extractClearKeyFromTR31KeyBlock(
    Tr31Intent.LMK,
    lmkHex,
    tr31BdkUnderLmk
  )

  const ksn = Buffer.from(ksnHex, 'hex')
  const bdk = clearBdkKey.clearKey
  if (bdk.length !== 24 || ksn.length !== 10) {
    throw new Error('BDK must be 24 bytes and KSN must be 10 bytes')
  }

  // Step 1: Mask the KSN (clear rightmost 21 bits)
  const ksnMasked = Buffer.from(ksn)
  ksnMasked[7] &= 0xe0
  ksnMasked[8] = 0x00
  ksnMasked[9] = 0x00

  // Step 2: Encrypt ksnMasked with original BDK (Key 1)
  const cipher1 = createCipheriv('des-ede3', bdk, null)
  let left = cipher1.update(ksnMasked.subarray(0, 8))
  left = Buffer.concat([left, cipher1.final()])

  // Step 3: XOR BDK with mask
  const mask = Buffer.from(
    'C0C0C0C000000000C0C0C0C000000000C0C0C0C000000000',
    'hex'
  )
  const bdkMasked = xorBuffers(bdk, mask)

  // Step 4: Encrypt ksnMasked with masked BDK (Key 2)
  const cipher2 = createCipheriv('des-ede3', bdkMasked, null)
  let right = cipher2.update(ksnMasked.subarray(0, 8))
  right = Buffer.concat([right, cipher2.final()])

  // Step 5: IPEK is 16-byte concat of both halves:
  const ipekClear = Buffer.concat([left, right])
  const tr31IpekUnderLmk = createTR31KeyBlockUnder(
    Tr31Intent.LMK,
    lmkHex,
    KeyUsage.IPK,
    'T',
    ipekClear
  )

  const clearTmkKey = extractClearKeyFromTR31KeyBlock(
    Tr31Intent.LMK,
    lmkHex,
    tr31TmkUnderLmk
  )

  const tr31IpekUnderTmk = createTR31KeyBlockUnder(
    Tr31Intent.TMK,
    clearTmkKey.clearKeyHex, // TMK
    KeyUsage.IPK,
    'T',
    ipekClear
  )
  return {
    tr31IpekUnderLmk: tr31IpekUnderLmk.tr31Block.toString('ascii'),
    tr31IpekUnderTmk: tr31IpekUnderTmk.tr31Block.toString('ascii'),
    kcv: tr31IpekUnderTmk.kcv
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

function importCardKey(
  lmkHex: string,
  tr31ZmkUnderLmk: string,
  tr31CardKeyUnderZmk: string,
  kcv?: string
): {
  tr31CardKeyUnderLmk: string
  kcv: string
} {
  // 1. Obtain the clear ZMK key from the ZMK under LMK:
  const clearZmkKey = extractClearKeyFromTR31KeyBlock(
    Tr31Intent.LMK,
    lmkHex,
    tr31ZmkUnderLmk
  )
  // 2. Obtain the clear Card key:
  const clearCardKey = extractClearKeyFromTR31KeyBlock(
    Tr31Intent.ZMK,
    clearZmkKey.clearKeyHex,
    tr31CardKeyUnderZmk
  )
  if (kcv && kcv !== clearCardKey.kcv) {
    throw new Error(
      `Expected KCV '${kcv}' but got '${clearCardKey.kcv}' instead.`
    )
  }

  const cardKeyUnderLmk = createTR31KeyBlockUnder(
    Tr31Intent.LMK,
    lmkHex,
    KeyUsage.DEK,
    'T',
    clearCardKey.clearKey
  )

  return {
    kcv: clearCardKey.kcv,
    tr31CardKeyUnderLmk: cardKeyUnderLmk.tr31Block.toString('ascii')
  }
}

function generateCardKey(
  lmk: string,
  tr31ZmkUnderLmk: string
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
      format: 'der'
      // We do not want encryption, as we make use of AES already.
      //cipher: 'aes-256-cbc', // Optional encryption
      //passphrase // Optional passphrase
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

  const clearPvtKcv = sha512Last3Bytes(privateKey)
  const clearZmkKeyHex = extractClearKeyFromTR31KeyBlock(
    Tr31Intent.LMK,
    lmk,
    tr31ZmkUnderLmk
  ).clearKeyHex
  const tr31CardKeyUnderZmk = createTR31KeyBlockUnder(
    Tr31Intent.ZMK,
    clearZmkKeyHex, //ZMK
    KeyUsage.DEK,
    'T',
    privateKey
  )

  if (tr31CardKeyUnderZmk.kcv !== clearPvtKcv) {
    throw new Error(
      `PvtKey under ZMK failure. Expected KCV '${clearPvtKcv}' but got '${tr31CardKeyUnderZmk.kcv}'.`
    )
  }

  const tr31CardKeyUnderLmkAscii =
    tr31CardKeyUnderLmk.tr31Block.toString('ascii')
  const pvtKey = extractClearKeyFromTR31KeyBlock(
    Tr31Intent.LMK,
    lmk,
    tr31CardKeyUnderLmkAscii
  )

  logger.debug(`Private key [BACK] size is ${pvtKey.clearKey.length} bytes.`)

  return {
    tr31CardKeyUnderLmk: tr31CardKeyUnderLmk.tr31Block.toString('ascii'),
    tr31CardKeyUnderZmk: tr31CardKeyUnderZmk.tr31Block.toString('ascii'),
    publicKey,
    kcv: clearPvtKcv
  }
}

function obtainKCVFrom3DESKey(key: Buffer | Uint8Array): string {
  const data = Buffer.alloc(8, 0x00) // 8 bytes of zeros
  const cipher = createCipheriv('des-ede3', key, null)
  const encrypted = Buffer.concat([cipher.update(data), cipher.final()])
  return encrypted.subarray(0, 3).toString('hex').toUpperCase() // First 3 bytes
}

function sha512Last3Bytes(input: Buffer | Uint8Array): string {
  const hexSha = createHash('sha512').update(input).digest('hex')
  return hexSha.slice(-6).toUpperCase()
}

function encryptWithAES256(
  plaintext: Buffer | Uint8Array,
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
  plaintext: Buffer | Uint8Array,
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
  logger.info(
    'decipher.decryptWithAES256: ' +
      ciphertext.length +
      ' <-> ' +
      key.length +
      ' <-> ' +
      iv.length +
      ' | ' +
      key +
      ' | ' +
      ciphertext
  )
  return Buffer.concat([decipher.update(ciphertext), decipher.final()])
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
  keyUsage: KeyUsage, // 3 chars, e.g., 'DEK' for Encryption Key
  keyType: string, // 1 char, e.g., 'T' for TDEA, 'A' for AES
  key: Buffer | Uint8Array, // Key material (e.g., 24 bytes for 3DES)
  zeroIv: boolean = true
): { iv: Buffer; tr31Block: Buffer; kcv: string } {
  if (intent == Tr31Intent.LMK && kekHex.length !== 64)
    throw new Error(
      `KEK (LMK) must be 64 hex chars (32 bytes), currently ${kekHex.length}`
    )
  //AES
  else if (
    (intent == Tr31Intent.ZMK || intent == Tr31Intent.TMK) &&
    kekHex.length !== 48
  )
    throw new Error(
      `KEK (ZMK) must be 48 hex chars (24 bytes), currently ${kekHex.length}`
    ) //3DES

  const kcv = isKeyUsageForNon3DS(keyUsage)
    ? sha512Last3Bytes(key)
    : obtainKCVFrom3DESKey(key)

  // for data, we convert to ASCII-HEX:
  if (isKeyUsageForNon3DS(keyUsage)) key = Buffer.from(key.toString('hex'))

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

  // Combine header and key
  const tr31Block = Buffer.concat([
    header,
    Buffer.from(encryptedKeyHex),
    Buffer.from(kcv)
  ])

  return {
    iv: encryptedKey.iv,
    tr31Block,
    kcv
  }
}

function isKeyUsageForNon3DS(keyUsage: KeyUsage): boolean {
  switch (keyUsage) {
    case KeyUsage.DEK:
    case KeyUsage.IPK:
      return true
    default:
      return false
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
  if (isKeyUsageForNon3DS(usage))
    clearKey = Buffer.from(clearKey.toString('ascii'), 'hex')

  const tr31Kcv = tr31.slice(-6)
  const kcvComputed = isKeyUsageForNon3DS(usage)
    ? sha512Last3Bytes(clearKey)
    : obtainKCVFrom3DESKey(clearKey)
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

// PIN block format ISO-0:
// Format: 0PPPPPPPPPPPPPPP ^ FFFFFFFFCCCCCCCC
// Where:
// 0 - Control field (0 for ISO-0)
// P - PIN (right-padded with F if less than 14 digits)
// F - Padding of 'F'
// C - Account number (rightmost 12 digits excluding check digit)
function formatPinBlockISO0(pin: string, pan: string): string {
  if (pin.length < 4 || pin.length > 14) {
    throw new Error('PIN must be between 4 and 14 digits')
  }
  if (!/^\d+$/.test(pin)) {
    throw new Error('PIN must contain only digits')
  }
  if (!/^\d+$/.test(pan)) {
    throw new Error('PAN must contain only digits')
  }

  // Format PIN block: 0 + PIN + padding with 'F'
  const pinPart = '0' + pin.padEnd(14, 'F')

  // Format PAN block: 12 rightmost digits of PAN excluding check digit
  const panPart = '0000' + pan.slice(-13, -1).padStart(12, '0')

  // XOR the PIN and PAN parts
  const pinBlock = Buffer.from(pinPart, 'hex')
  const panBlock = Buffer.from(panPart, 'hex')
  const result = xorBuffers(pinBlock, panBlock)

  return result.toString('hex').toUpperCase()
}

// PIN block format ISO-1:
// Format: 1PPPPPPPPPPPPPPP ^ FFFFFFFFCCCCCCCC
// Where:
// 1 - Control field (1 for ISO-1)
// P - PIN (right-padded with F if less than 14 digits)
// F - Padding of 'F'
// C - Account number (rightmost 12 digits excluding check digit)
function formatPinBlockISO1(pin: string, pan: string): string {
  if (pin.length < 4 || pin.length > 14) {
    throw new Error('PIN must be between 4 and 14 digits')
  }
  if (!/^\d+$/.test(pin)) {
    throw new Error('PIN must contain only digits')
  }
  if (!/^\d+$/.test(pan)) {
    throw new Error('PAN must contain only digits')
  }

  // Format PIN block: 1 + PIN + padding with 'F'
  const pinPart = '1' + pin.padEnd(14, 'F')

  // Format PAN block: 12 rightmost digits of PAN excluding check digit
  const panPart = '0000' + pan.slice(-13, -1).padStart(12, '0')

  // XOR the PIN and PAN parts
  const pinBlock = Buffer.from(pinPart, 'hex')
  const panBlock = Buffer.from(panPart, 'hex')
  const result = xorBuffers(pinBlock, panBlock)

  return result.toString('hex').toUpperCase()
}

// Parse PIN block format ISO-0 or ISO-1
function parsePinBlock(
  pinBlock: string,
  pan: string,
  format: 'ISO-0' | 'ISO-1'
): string {
  if (pinBlock.length !== 16) {
    throw new Error('PIN block must be 16 hexadecimal characters')
  }
  if (!/^[0-9A-Fa-f]+$/.test(pinBlock)) {
    throw new Error('PIN block must contain only hexadecimal characters')
  }
  if (!/^\d+$/.test(pan)) {
    throw new Error('PAN must contain only digits')
  }

  // Format PAN block: 12 rightmost digits of PAN excluding check digit
  const panPart = '0000' + pan.slice(-13, -1).padStart(12, '0')

  // XOR the PIN block with the PAN block to get the PIN part
  const pinBlockBuffer = Buffer.from(pinBlock, 'hex')
  const panBlockBuffer = Buffer.from(panPart, 'hex')
  const pinPartBuffer = xorBuffers(pinBlockBuffer, panBlockBuffer)
  const pinPart = pinPartBuffer.toString('hex').toUpperCase()

  // Check the format
  const controlField = pinPart.charAt(0)
  const expectedControlField = format === 'ISO-0' ? '0' : '1'
  if (controlField !== expectedControlField) {
    throw new Error(
      `Invalid PIN block format. Expected ${format} (control field ${expectedControlField}), but got ${controlField}`
    )
  }

  // Extract the PIN
  const pinWithPadding = pinPart.substring(1)
  const pin = pinWithPadding.split('F')[0]

  if (pin.length < 4 || pin.length > 14) {
    throw new Error('Invalid PIN length in PIN block')
  }

  return pin
}

// Translate PIN from one format to another
function translatePin(
  pinBlock: string,
  sourcePan: string,
  sourceFormat: 'ISO-0' | 'ISO-1',
  targetPan: string,
  targetFormat: 'ISO-0' | 'ISO-1',
  pinEncryptionKey: string
): string {
  // Parse the PIN block to get the clear PIN
  const pin = parsePinBlock(pinBlock, sourcePan, sourceFormat)

  // Format the PIN block in the target format
  const newPinBlock =
    targetFormat === 'ISO-0'
      ? formatPinBlockISO0(pin, targetPan)
      : formatPinBlockISO1(pin, targetPan)

  return newPinBlock
}

// Verify PIN
function verifyPin(
  pinBlock: string,
  pan: string,
  format: 'ISO-0' | 'ISO-1',
  expectedPin: string,
  pinEncryptionKey: string
): boolean {
  // Parse the PIN block to get the clear PIN
  const pin = parsePinBlock(pinBlock, pan, format)

  // Compare with the expected PIN
  return pin === expectedPin
}

export {
  generate3DESKeyFromComponents,
  import3DESKeyFromComponents,
  obtainKCVFrom3DESKey,
  createTR31KeyBlockUnder,
  generateTMK,
  generateBDK,
  deriveIPEK,
  importTMK,
  generateCardKey,
  importCardKey,
  formatPinBlockISO0,
  formatPinBlockISO1,
  parsePinBlock,
  translatePin,
  verifyPin,
  AES_MERCHANT_ASE_LMK_HEX,
  AES_CUSTOMER_ASE_LMK_HEX,
  AES_KAI_LMK_HEX,
  AES_AUSTRIA_CARD_LMK_HEX,
  KeyUsage,
  Tr31Intent
}
