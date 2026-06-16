import 'dotenv/config'
import sharp from 'sharp'
import { loadServerEnv, logApiKeyStatus } from '../server/env.ts'
import { validateReferenceImage } from '../server/recognize/referenceService.ts'
import { canUseRekognition } from '../server/recognize/rekognitionClient.ts'

loadServerEnv('.')
logApiKeyStatus('.')
console.log('canUseRekognition:', canUseRekognition())

const buf = await sharp({
  create: { width: 200, height: 200, channels: 3, background: { r: 200, g: 180, b: 160 } },
}).jpeg().toBuffer()
console.log('test image bytes:', buf.length)

const result = await validateReferenceImage(buf, 'upload')
console.log('result:', JSON.stringify(result, null, 2))
