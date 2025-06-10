import fastify from 'fastify'
import logger from './logger'
import {
  AES_AUSTRIA_CARD_LMK_HEX,
  AES_CUSTOMER_ASE_LMK_HEX,
  AES_MERCHANT_ASE_LMK_HEX,
  AES_KAI_LMK_HEX,
  createTR31KeyBlockUnder,
  importTMK,
  generate3DESKeyFromComponents,
  generateTMK,
  generateBDK,
  deriveIPEK,
  import3DESKeyFromComponents,
  KeyUsage,
  Tr31Intent,
  generateCardKey,
  importCardKey
} from './card-hsm'

export function createApp(port: number) {
  const app = fastify()

  app.post(
    '/hsm/ase-customer/generate-zmk',
    async function handler(ffReq, ffReply) {
      const genCleanZmkKey = generate3DESKeyFromComponents()
      const { iv, tr31Block } = createTR31KeyBlockUnder(
        Tr31Intent.LMK,
        AES_CUSTOMER_ASE_LMK_HEX,
        KeyUsage.ZMK,
        'T',
        genCleanZmkKey.finalKeyBuffer
      )

      logger.info(
        `Generated ZMK (Issuer): ${tr31Block.toString('ascii')} with KCV: ${genCleanZmkKey.kcv}`
      )

      ffReply.code(200).send({
        iv: iv.toString('hex'),
        tr31Block: tr31Block.toString('ascii'), // Only to be used with ILF HSM
        component1: genCleanZmkKey.component1, // DANGER! Sent to custodian 1.
        component2: genCleanZmkKey.component2, // DANGER! Sent to custodian 2.
        component3: genCleanZmkKey.component3, // DANGER! Sent to custodian 3.
        finalKey: genCleanZmkKey.finalKey, // FATAL! Never in the clear. XOR of key elements.
        kcv: genCleanZmkKey.kcv // This allows all parties to verify the integrity of the key.
      })
    }
  )

  app.post(
    '/hsm/ase-merchant/generate-zmk',
    async function handler(ffReq, ffReply) {
      const genCleanZmkKey = generate3DESKeyFromComponents()
      const { iv, tr31Block } = createTR31KeyBlockUnder(
        Tr31Intent.LMK,
        AES_MERCHANT_ASE_LMK_HEX,
        KeyUsage.ZMK,
        'T',
        genCleanZmkKey.finalKeyBuffer
      )

      logger.info(
        `Generated ZMK (Acquirer): ${tr31Block.toString('ascii')} with KCV: ${genCleanZmkKey.kcv}`
      )

      ffReply.code(200).send({
        iv: iv.toString('hex'),
        tr31Block: tr31Block.toString('ascii'), // Only to be used with ILF HSM
        component1: genCleanZmkKey.component1, // DANGER! Sent to custodian 1.
        component2: genCleanZmkKey.component2, // DANGER! Sent to custodian 2.
        component3: genCleanZmkKey.component3, // DANGER! Sent to custodian 3.
        finalKey: genCleanZmkKey.finalKey, // FATAL! Never in the clear. XOR of key elements.
        kcv: genCleanZmkKey.kcv // This allows all parties to verify the integrity of the key.
      })
    }
  )

  app.post(
    '/hsm/ase-merchant/generate-bdk',
    async function handler(ffReq, ffReply) {
      const requestBody = JSON.parse(JSON.stringify(ffReq.body))
      const { zmkUnderLmk } = requestBody

      const genBdkKey = generateBDK(AES_MERCHANT_ASE_LMK_HEX, zmkUnderLmk)

      logger.info(
        `ILF generated BDK (Acquirer) '${genBdkKey.tr31BdkUnderZmk}|${genBdkKey.tr31BdkUnderZmk}' with KCV: ${genBdkKey.kcv}`
      )

      ffReply.code(200).send({
        tr31BdkUnderLmk: genBdkKey.tr31BdkUnderLmk,
        tr31BdkUnderZmk: genBdkKey.tr31BdkUnderZmk,
        kcv: genBdkKey.kcv
      })
    }
  )

  app.post(
    '/hsm/ase-merchant/derive-ipek',
    async function handler(ffReq, ffReply) {
      const requestBody = JSON.parse(JSON.stringify(ffReq.body))
      const { tr31BdkUnderLmk, tr31TmkUnderLmk, ksnHex } = requestBody
      const ipek = deriveIPEK(
        AES_MERCHANT_ASE_LMK_HEX,
        tr31BdkUnderLmk,
        tr31TmkUnderLmk,
        ksnHex
      )
      logger.info(
        `ILF generated IPEK (Acquirer) '${ipek.tr31IpekUnderLmk}|${ipek.tr31IpekUnderTmk}' with KCV: ${ipek.kcv}`
      )

      ffReply.code(200).send({
        tr31IpekUnderLmk: ipek.tr31IpekUnderLmk,
        tr31IpekUnderTmk: ipek.tr31IpekUnderTmk,
        kcv: ipek.kcv
      })
    }
  )

  app.post('/hsm/kai-os/import-zmk', async function handler(ffReq, ffReply) {
    const requestBody = JSON.parse(JSON.stringify(ffReq.body))
    const { component1, component2, component3, kcv } = requestBody

    const zmkKey = import3DESKeyFromComponents(
      AES_KAI_LMK_HEX,
      KeyUsage.ZMK,
      component1,
      component2,
      component3,
      kcv
    )

    logger.info(
      `KaiOS imported ZMK (Terminal Manufacturer) '${zmkKey.tr31KeyBlock}' with KCV: ${zmkKey.kcv}`
    )

    ffReply.code(200).send({
      iv: zmkKey.iv.toString('hex'),
      tr31Block: zmkKey.tr31KeyBlock, // Only to be used with KAI HSM
      kcv // This allows all parties to verify the integrity of the key.
    })
  })

  app.post(
    '/hsm/austria-card/import-zmk',
    async function handler(ffReq, ffReply) {
      const requestBody = JSON.parse(JSON.stringify(ffReq.body))
      const { component1, component2, component3, kcv } = requestBody

      const zmkKey = import3DESKeyFromComponents(
        AES_AUSTRIA_CARD_LMK_HEX,
        KeyUsage.ZMK,
        component1,
        component2,
        component3,
        kcv
      )

      logger.info(
        `AustriaCard imported ZMK (Card Personalization) '${zmkKey.tr31KeyBlock}' with KCV: ${zmkKey.kcv}`
      )

      ffReply.code(200).send({
        iv: zmkKey.iv.toString('hex'),
        tr31Block: zmkKey.tr31KeyBlock, // Only to be used with KAI HSM
        kcv // This allows all parties to verify the integrity of the key.
      })
    }
  )

  app.post('/hsm/kai-os/generate-tmk', async function handler(ffReq, ffReply) {
    const requestBody = JSON.parse(JSON.stringify(ffReq.body))
    const { zmkUnderLmk, terminalSerial } = requestBody

    const genTmkKey = generateTMK(AES_KAI_LMK_HEX, zmkUnderLmk)

    logger.info(
      `KaiOS generated TMK (Terminal Manufacturer) '${genTmkKey.tr31TmkUnderLmk}|${genTmkKey.tr31TmkUnderZmk}' with KCV: ${genTmkKey.kcv}`
    )

    ffReply.code(200).send({
      tr31TmkUnderLmk: genTmkKey.tr31TmkUnderLmk,
      tr31TmkUnderZmk: genTmkKey.tr31TmkUnderZmk,
      terminalSerial,
      kcv: genTmkKey.kcv
    })
  })

  app.post(
    '/hsm/ase-merchant/import-tmk',
    async function handler(ffReq, ffReply) {
      const requestBody = JSON.parse(JSON.stringify(ffReq.body))
      const { tr31ZmkUnderLmk, tr31TmkUnderZmk, kcv } = requestBody

      const tr31TmkUnderLmk = importTMK(
        AES_MERCHANT_ASE_LMK_HEX,
        tr31ZmkUnderLmk,
        tr31TmkUnderZmk,
        kcv
      )

      logger.info(
        `ILF imported TMK (Merchant) '${tr31TmkUnderLmk.tr31TmkUnderLmk}' with KCV: ${tr31TmkUnderLmk.kcv}`
      )

      ffReply.code(200).send({
        tr31TmkUnderLmk: tr31TmkUnderLmk.tr31TmkUnderLmk,
        kcv: tr31TmkUnderLmk.kcv
      })
    }
  )

  // At this point, we have a mechanism for transporting keys to the card and terminal via TMK.
  // We are now able to issue SRED and PIN BDK keys.

  app.post(
    '/hsm/ase-customer/generate-card-key',
    async function handler(ffReq, ffReply) {
      const requestBody = JSON.parse(JSON.stringify(ffReq.body))
      const { tr31ZmkUnderLmk } = requestBody
      const genCardKey = generateCardKey(
        AES_CUSTOMER_ASE_LMK_HEX,
        tr31ZmkUnderLmk
      )

      logger.info(
        `ILF generated Card Key-Pair (Issuer) '${genCardKey.tr31CardKeyUnderLmk}|${genCardKey.tr31CardKeyUnderZmk}' with KCV: ${genCardKey.kcv}`
      )

      ffReply.code(200).send({
        tr31CardKeyUnderLmk: genCardKey.tr31CardKeyUnderLmk,
        tr31CardKeyUnderZmk: genCardKey.tr31CardKeyUnderZmk,
        publicKey: genCardKey.publicKey,
        kcv: genCardKey.kcv
      })
    }
  )

  app.post(
    '/hsm/austria-card/import-card-key',
    async function handler(ffReq, ffReply) {
      const requestBody = JSON.parse(JSON.stringify(ffReq.body))
      const { tr31ZmkUnderLmk, tr31CardKeyUnderZmk, kcv } = requestBody

      const tr31CardKeyUnderLmk = importCardKey(
        AES_AUSTRIA_CARD_LMK_HEX,
        tr31ZmkUnderLmk,
        tr31CardKeyUnderZmk,
        kcv
      )

      logger.info(
        `ILF imported CardKey (Card Personalization) '${tr31CardKeyUnderLmk.tr31CardKeyUnderLmk}' with KCV: ${tr31CardKeyUnderLmk.kcv}`
      )

      ffReply.code(200).send({
        tr31CardKeyUnderLmk: tr31CardKeyUnderLmk.tr31CardKeyUnderLmk,
        kcv: tr31CardKeyUnderLmk.kcv
      })
    }
  )

  return async () => {
    await app.listen({ port, host: '0.0.0.0' })
    logger.info(
      `🗃 -> 🔑 <-🗃 'Rafiki-HSM-Emulator' Listening on port '${port}'`
    )
  }
}
