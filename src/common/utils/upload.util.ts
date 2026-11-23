import { BadRequestException } from '@nestjs/common';
import type { MulterModuleOptions } from '@nestjs/platform-express';
import { existsSync, mkdirSync } from 'fs';
import { diskStorage } from 'multer';
import { basename, extname, resolve, sep } from 'path';

export type UploadValidationMode =
  | 'image'
  | 'image_with_svg'
  | 'receipt'
  | 'document_or_image';

export interface SafeUploadPath {
  cleanPath: string;
  relativePath: string;
  blobName: string;
  localFile: string;
}

export interface DiskMulterOptionsConfig {
  resolveDestination: (req: any, file: any) => string;
  mode: UploadValidationMode | ((req: any, file: any) => UploadValidationMode);
  maxFileSizeBytes: number;
  withTimestamp?: boolean;
  filenameBuilder?: (req: any, file: any, sanitizedFilename: string) => string;
}

const MIME_TYPE_BY_EXTENSION: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.bmp': 'image/bmp',
  '.tif': 'image/tiff',
  '.tiff': 'image/tiff',
  '.ico': 'image/x-icon',
  '.pdf': 'application/pdf',
  '.csv': 'text/csv; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.json': 'application/json',
  '.xml': 'application/xml',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.ppt': 'application/vnd.ms-powerpoint',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.zip': 'application/zip',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
  '.webm': 'audio/webm',
  '.m4a': 'audio/mp4',
  '.mp4': 'video/mp4',
};

const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif']);
const IMAGE_MIME_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/pjpeg',
  'image/png',
  'image/webp',
  'image/gif',
]);

const TENANT_IMAGE_EXTENSIONS = new Set([
  ...IMAGE_EXTENSIONS,
  '.svg',
  '.bmp',
  '.tif',
  '.tiff',
]);
const TENANT_IMAGE_MIME_TYPES = new Set([
  ...IMAGE_MIME_TYPES,
  'image/svg+xml',
  'image/bmp',
  'image/x-ms-bmp',
  'image/tiff',
]);

const RECEIPT_EXTENSIONS = new Set([...IMAGE_EXTENSIONS, '.pdf']);
const RECEIPT_MIME_TYPES = new Set([...IMAGE_MIME_TYPES, 'application/pdf']);

const DANGEROUS_EXTENSIONS = new Set([
  '.exe',
  '.msi',
  '.dll',
  '.bat',
  '.cmd',
  '.ps1',
  '.psm1',
  '.sh',
  '.bash',
  '.zsh',
  '.js',
  '.mjs',
  '.cjs',
  '.jsx',
  '.ts',
  '.tsx',
  '.html',
  '.htm',
  '.xhtml',
  '.svg',
  '.php',
  '.phtml',
  '.asp',
  '.aspx',
  '.jsp',
  '.py',
  '.rb',
  '.pl',
  '.jar',
  '.vbs',
  '.vbe',
  '.scr',
  '.com',
  '.hta',
  '.reg',
]);

const DANGEROUS_MIME_TYPES = new Set([
  'text/html',
  'application/xhtml+xml',
  'application/javascript',
  'text/javascript',
  'application/x-javascript',
  'application/x-msdownload',
  'application/x-msdos-program',
  'application/x-sh',
  'application/x-csh',
  'application/x-httpd-php',
  'text/x-php',
  'application/x-bat',
  'image/svg+xml',
]);

export function inferMimeTypeFromPath(filePath: string): string {
  const cleanPath = (filePath || '').split('?')[0].split('#')[0];
  const ext = extname(cleanPath).toLowerCase();
  return MIME_TYPE_BY_EXTENSION[ext] || 'application/octet-stream';
}

export function decodeUploadOriginalName(rawName: string): string {
  if (!rawName) return 'archivo';
  try {
    const utf8FromLatin1 = Buffer.from(rawName, 'latin1').toString('utf8');
    if (utf8FromLatin1 !== rawName && !utf8FromLatin1.includes('\uFFFD')) {
      return utf8FromLatin1;
    }
  } catch {
    // Fallback to rawName below
  }
  return rawName;
}

export function sanitizeUploadFilename(originalName: string, withTimestamp = true): string {
  const decoded = decodeUploadOriginalName(originalName).trim();
  const rawExt = extname(decoded).toLowerCase();
  const safeExt = /^\.[a-z0-9]{1,10}$/.test(rawExt) ? rawExt : '';

  const rawBase = safeExt ? basename(decoded, extname(decoded)) : decoded;
  const asciiBase = rawBase
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^[._-]+|[._-]+$/g, '')
    .slice(0, 120);

  const finalName = `${asciiBase || 'archivo'}${safeExt}`;
  return withTimestamp ? `${Date.now()}-${finalName}` : finalName;
}

export function resolveSafeFileExtension(
  originalName: string,
  allowedExtensions: Set<string>,
  fallbackExt = 'png',
): string {
  const decoded = decodeUploadOriginalName(originalName).trim();
  const ext = extname(decoded).toLowerCase();
  if (ext && allowedExtensions.has(ext)) {
    return ext.slice(1);
  }
  return fallbackExt.replace(/^\./, '');
}

export function decodeSafeUploadPath(rawPath: string, uploadsDir: string): SafeUploadPath | null {
  if (!rawPath || rawPath.includes('\0')) {
    return null;
  }

  const pathWithoutQuery = rawPath.split('?')[0].split('#')[0];
  const withoutPrefix = pathWithoutQuery
    .replace(/^\/backend\/uploads(?=\/|$)/i, '')
    .replace(/^\/uploads(?=\/|$)/i, '');

  let decoded: string;
  try {
    decoded = decodeURIComponent(withoutPrefix);
  } catch {
    return null;
  }

  if (!decoded || decoded.includes('\0')) {
    return null;
  }

  const normalizedSlashes = decoded.replace(/\\/g, '/');
  const relativePath = normalizedSlashes.replace(/^\/+/, '').replace(/\/+/g, '/');
  if (!relativePath) {
    return null;
  }

  const segments = relativePath.split('/');
  if (segments.some((segment) => !segment || segment === '.' || segment === '..')) {
    return null;
  }

  const resolvedBase = resolve(uploadsDir);
  const resolvedLocal = resolve(resolvedBase, ...segments);
  if (!resolvedLocal.startsWith(resolvedBase + sep)) {
    return null;
  }

  return {
    cleanPath: `/${relativePath}`,
    relativePath,
    blobName: `uploads/${relativePath}`,
    localFile: resolvedLocal,
  };
}

export function validateUploadFile(
  file: { originalname?: string; mimetype?: string } | undefined,
  mode: UploadValidationMode,
): string | null {
  if (!file) {
    return 'Archivo inválido o vacío.';
  }

  const decodedName = decodeUploadOriginalName(file.originalname || '');
  const ext = extname(decodedName).toLowerCase();
  const mimetype = (file.mimetype || '').toLowerCase().split(';')[0].trim();
  const isGenericOctetStream = !mimetype || mimetype === 'application/octet-stream';

  if (mode === 'image') {
    if (!IMAGE_EXTENSIONS.has(ext)) {
      return `Formato de imagen no permitido (${ext || 'sin extensión'}). Usa PNG, JPG, JPEG, WEBP o GIF.`;
    }
    if (!IMAGE_MIME_TYPES.has(mimetype) && !isGenericOctetStream) {
      return `Tipo MIME de imagen no permitido (${mimetype}). Usa PNG, JPG, JPEG, WEBP o GIF.`;
    }
    return null;
  }

  if (mode === 'image_with_svg') {
    if (!TENANT_IMAGE_EXTENSIONS.has(ext)) {
      return `Formato de logotipo no permitido (${ext || 'sin extensión'}). Usa PNG, JPG, JPEG, WEBP, GIF, SVG, BMP o TIFF.`;
    }
    if (!TENANT_IMAGE_MIME_TYPES.has(mimetype) && !isGenericOctetStream) {
      return `Tipo MIME de logotipo no permitido (${mimetype}).`;
    }
    return null;
  }

  if (mode === 'receipt') {
    if (!RECEIPT_EXTENSIONS.has(ext)) {
      return `Formato de comprobante no permitido (${ext || 'sin extensión'}). Usa PDF o imagen (PNG, JPG, WEBP, GIF).`;
    }
    if (!RECEIPT_MIME_TYPES.has(mimetype) && !isGenericOctetStream) {
      return `Tipo MIME de comprobante no permitido (${mimetype}).`;
    }
    return null;
  }

  // 'document_or_image'
  if (DANGEROUS_EXTENSIONS.has(ext)) {
    return `Tipo de archivo bloqueado por seguridad (${ext}).`;
  }
  if (DANGEROUS_MIME_TYPES.has(mimetype)) {
    return `Tipo MIME bloqueado por seguridad (${mimetype}).`;
  }
  if (!/^\.[a-z0-9]{1,10}$/.test(ext)) {
    return 'El archivo debe tener una extensión válida.';
  }

  return null;
}

export function createMulterFileFilter(
  modeOrResolver: UploadValidationMode | ((req: any, file: any) => UploadValidationMode),
) {
  return (req: any, file: any, cb: (error: Error | null, acceptFile: boolean) => void) => {
    const mode = typeof modeOrResolver === 'function' ? modeOrResolver(req, file) : modeOrResolver;
    const validationError = validateUploadFile(file, mode);
    if (validationError) {
      return cb(new BadRequestException(validationError), false);
    }
    cb(null, true);
  };
}

export function assertSafeUploadParamId(rawId: unknown, paramLabel = 'ID'): string {
  const value = typeof rawId === 'string' ? rawId.trim() : '';
  if (!value) {
    throw new BadRequestException(`${paramLabel} is missing from parameters`);
  }
  if (/[\\/\0]|\.\./.test(value)) {
    throw new BadRequestException(`Invalid ${paramLabel} for upload destination`);
  }
  return value;
}

export function createDiskMulterOptions(config: DiskMulterOptionsConfig): MulterModuleOptions {
  return {
    storage: diskStorage({
      destination: (req, file, cb) => {
        try {
          const uploadPath = config.resolveDestination(req, file);
          if (!existsSync(uploadPath)) {
            mkdirSync(uploadPath, { recursive: true });
          }
          cb(null, uploadPath);
        } catch (err) {
          cb(err as Error, '');
        }
      },
      filename: (req, file, cb) => {
        const sanitized = sanitizeUploadFilename(
          file?.originalname || 'archivo',
          config.withTimestamp ?? true,
        );
        const finalName = config.filenameBuilder
          ? config.filenameBuilder(req, file, sanitized)
          : sanitized;
        cb(null, finalName);
      },
    }),
    fileFilter: createMulterFileFilter(config.mode),
    limits: {
      fileSize: config.maxFileSizeBytes,
    },
  };
}

export function isAllowedTenantImageExtension(extWithDot: string): boolean {
  return TENANT_IMAGE_EXTENSIONS.has(extWithDot.toLowerCase());
}

export { TENANT_IMAGE_EXTENSIONS };
