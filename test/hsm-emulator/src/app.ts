import fastify from 'fastify'
import logger from './logger'
import {
  AES_AUSTRIA_CARD_LMK_HEX,
  AES_ILF_LMK_HEX,
  AES_KAI_LMK_HEX,
  createTR31KeyBlockUnder,
  importTMK,
  generate3DESKeyFromComponents,
  generateTMK,
  import3DESKeyFromComponents,
  KeyUsage,
  Tr31Intent,
  generateCardKey,
  importCardKey
} from './card-hsm'

export function createApp(port: number) {
  const app = fastify()

  app.post('/hsm-ilf/generate-zmk', async function handler(ffReq, ffReply) {
    const genCleanZmkKey = generate3DESKeyFromComponents()
    const { iv, tr31Block } = createTR31KeyBlockUnder(
      Tr31Intent.LMK,
      AES_ILF_LMK_HEX,
      KeyUsage.ZMK,
      'T',
      genCleanZmkKey.finalKeyBuffer
    )

    logger.info(
      `Generated ZMK: ${tr31Block.toString('ascii')} with KCV: ${genCleanZmkKey.kcv}`
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
  })

  app.post('/hsm-kai/import-zmk', async function handler(ffReq, ffReply) {
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
      `KaiOS imported ZMK '${zmkKey.tr31KeyBlock}' with KCV: ${zmkKey.kcv}`
    )

    ffReply.code(200).send({
      iv: zmkKey.iv.toString('hex'),
      tr31Block: zmkKey.tr31KeyBlock, // Only to be used with KAI HSM
      kcv // This allows all parties to verify the integrity of the key.
    })
  })

  app.post(
    '/hsm-austria-card/import-zmk',
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
        `AustriaCard imported ZMK '${zmkKey.tr31KeyBlock}' with KCV: ${zmkKey.kcv}`
      )

      ffReply.code(200).send({
        iv: zmkKey.iv.toString('hex'),
        tr31Block: zmkKey.tr31KeyBlock, // Only to be used with KAI HSM
        kcv // This allows all parties to verify the integrity of the key.
      })
    }
  )

  app.post('/hsm-kai/generate-tmk', async function handler(ffReq, ffReply) {
    const requestBody = JSON.parse(JSON.stringify(ffReq.body))
    const { zmkUnderLmk, terminalSerial } = requestBody

    const genTmkKey = generateTMK(AES_KAI_LMK_HEX, zmkUnderLmk)

    logger.info(
      `KaiOS generated TMK '${genTmkKey.tr31TmkUnderLmk}|${genTmkKey.tr31TmkUnderZmk}' with KCV: ${genTmkKey.kcv}`
    )

    ffReply.code(200).send({
      tr31TmkUnderLmk: genTmkKey.tr31TmkUnderLmk,
      tr31TmkUnderZmk: genTmkKey.tr31TmkUnderZmk,
      terminalSerial,
      kcv: genTmkKey.kcv
    })
  })

  app.post('/hsm-ilf/import-tmk', async function handler(ffReq, ffReply) {
    const requestBody = JSON.parse(JSON.stringify(ffReq.body))
    const { tr31ZmkUnderLmk, tr31TmkUnderZmk, kcv } = requestBody

    const tr31TmkUnderLmk = importTMK(
      AES_ILF_LMK_HEX,
      tr31ZmkUnderLmk,
      tr31TmkUnderZmk,
      kcv
    )

    logger.info(
      `ILF imported TMK '${tr31TmkUnderLmk.tr31TmkUnderLmk}' with KCV: ${tr31TmkUnderLmk.kcv}`
    )

    ffReply.code(200).send({
      tr31TmkUnderLmk: tr31TmkUnderLmk.tr31TmkUnderLmk,
      kcv: tr31TmkUnderLmk.kcv
    })
  })

  // At this point, we have a mechanism for transporting keys to the card and terminal via TMK.
  // We are now able to issue SRED and PIN BDK keys.

  app.post(
    '/hsm-ilf/generate-card-key',
    async function handler(ffReq, ffReply) {
      const requestBody = JSON.parse(JSON.stringify(ffReq.body))
      const { tr31ZmkUnderLmk } = requestBody
      const genCardKey = generateCardKey(AES_ILF_LMK_HEX, tr31ZmkUnderLmk)

      logger.info(
        `ILF generated Card Key-Pair '${genCardKey.tr31CardKeyUnderLmk}|${genCardKey.tr31CardKeyUnderZmk}' with KCV: ${genCardKey.kcv}`
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
    '/hsm-austria-card/import-card-key',
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
        `ILF imported CardKey '${tr31CardKeyUnderLmk.tr31CardKeyUnderLmk}' with KCV: ${tr31CardKeyUnderLmk.kcv}`
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
