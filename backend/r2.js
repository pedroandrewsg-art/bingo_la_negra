// r2.js — Cliente S3 compartido para Cloudflare R2 (almacenamiento de objetos).
// Se usa para guardar archivos que antes iban al disco local (ej. logo del
// sitio) y así sobrevivan a redeploys sin necesitar un Disk pago en Render.
const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');

const r2 = new S3Client({
  region: 'auto',
  endpoint: process.env.R2_ENDPOINT,
  forcePathStyle: true,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

const BUCKET = process.env.R2_BUCKET;

module.exports = { r2, BUCKET, PutObjectCommand, GetObjectCommand, DeleteObjectCommand };
