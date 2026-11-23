import { BadRequestException } from '@nestjs/common';
import { join, resolve } from 'path';
import {
  assertSafeUploadParamId,
  createMulterFileFilter,
  decodeSafeUploadPath,
  inferMimeTypeFromPath,
  resolveSafeFileExtension,
  sanitizeUploadFilename,
  TENANT_IMAGE_EXTENSIONS,
  validateUploadFile,
} from './upload.util';

describe('upload.util', () => {
  describe('decodeSafeUploadPath', () => {
    const uploadsDir = join(process.cwd(), 'uploads');

    it('decodes percent-encoded filenames such as %20 for both local lookup and Azure blobName', () => {
      const result = decodeSafeUploadPath(
        '/products/aabb0b7f-44a4-47ac-b35e-cb2db3e75a87/cover/1795460846163-Screenshot%202026-08-11%20130217.png',
        uploadsDir,
      );

      expect(result).not.toBeNull();
      expect(result!.cleanPath).toBe(
        '/products/aabb0b7f-44a4-47ac-b35e-cb2db3e75a87/cover/1795460846163-Screenshot 2026-08-11 130217.png',
      );
      expect(result!.blobName).toBe(
        'uploads/products/aabb0b7f-44a4-47ac-b35e-cb2db3e75a87/cover/1795460846163-Screenshot 2026-08-11 130217.png',
      );
      expect(result!.localFile).toBe(
        resolve(
          uploadsDir,
          'products',
          'aabb0b7f-44a4-47ac-b35e-cb2db3e75a87',
          'cover',
          '1795460846163-Screenshot 2026-08-11 130217.png',
        ),
      );
    });

    it('strips optional /backend/uploads or /uploads prefixes', () => {
      const a = decodeSafeUploadPath('/backend/uploads/tenants/1/logo%20final.webp', uploadsDir);
      const b = decodeSafeUploadPath('/uploads/tenants/1/logo%20final.webp', uploadsDir);

      expect(a?.blobName).toBe('uploads/tenants/1/logo final.webp');
      expect(b?.blobName).toBe('uploads/tenants/1/logo final.webp');
    });

    it('blocks path traversal, encoded traversal, null bytes, and malformed encodings', () => {
      expect(decodeSafeUploadPath('/products/../../.env', uploadsDir)).toBeNull();
      expect(decodeSafeUploadPath('/products/%2e%2e/%2e%2e/package.json', uploadsDir)).toBeNull();
      expect(decodeSafeUploadPath('/products/abc/file%00.png', uploadsDir)).toBeNull();
      expect(decodeSafeUploadPath('/products/abc/%ZZinvalid.png', uploadsDir)).toBeNull();
      expect(decodeSafeUploadPath('/', uploadsDir)).toBeNull();
    });
  });

  describe('sanitizeUploadFilename', () => {
    it('replaces spaces and unsafe characters with underscores and adds timestamp by default', () => {
      const sanitized = sanitizeUploadFilename('Screenshot 2026-08-11 130217.png');
      expect(sanitized).toMatch(/^\d+-Screenshot_2026-08-11_130217\.png$/);
    });

    it('normalizes Multer latin1-decoded UTF-8 accents and strips punctuation', () => {
      const multerLatin1Name = Buffer.from('Diseño Gráfico (versión #2).jpeg', 'utf8').toString('latin1');
      const sanitized = sanitizeUploadFilename(multerLatin1Name, false);
      expect(sanitized).toBe('Diseno_Grafico_version_2.jpeg');
    });

    it('falls back to "archivo" when base name becomes empty after sanitization', () => {
      expect(sanitizeUploadFilename('###@@.png', false)).toBe('archivo.png');
    });
  });

  describe('resolveSafeFileExtension', () => {
    it('returns whitelisted extension or falls back to png', () => {
      expect(resolveSafeFileExtension('brand logo.svg', TENANT_IMAGE_EXTENSIONS)).toBe('svg');
      expect(resolveSafeFileExtension('malware.exe?v=1', TENANT_IMAGE_EXTENSIONS, 'png')).toBe('png');
    });
  });

  describe('inferMimeTypeFromPath', () => {
    it('resolves common images, SVG, PDF, and falls back to application/octet-stream', () => {
      expect(inferMimeTypeFromPath('uploads/products/1/cover/photo.PNG?v=1')).toBe('image/png');
      expect(inferMimeTypeFromPath('uploads/products/1/cover/photo.jpg')).toBe('image/jpeg');
      expect(inferMimeTypeFromPath('uploads/tenants/1/logo.webp')).toBe('image/webp');
      expect(inferMimeTypeFromPath('uploads/tenants/1/logo.svg')).toBe('image/svg+xml');
      expect(inferMimeTypeFromPath('uploads/quotations/1/cotizacion.pdf')).toBe('application/pdf');
      expect(inferMimeTypeFromPath('uploads/misc/unknown.custom')).toBe('application/octet-stream');
    });
  });

  describe('validateUploadFile and createMulterFileFilter', () => {
    it('validates strict image mode accurately', () => {
      expect(validateUploadFile({ originalname: 'foto.png', mimetype: 'image/png' }, 'image')).toBeNull();
      expect(
        validateUploadFile({ originalname: 'foto.webp', mimetype: 'application/octet-stream' }, 'image'),
      ).toBeNull();
      expect(
        validateUploadFile({ originalname: 'logo.svg', mimetype: 'image/svg+xml' }, 'image'),
      ).not.toBeNull();
      expect(
        validateUploadFile({ originalname: 'doc.pdf', mimetype: 'application/pdf' }, 'image'),
      ).not.toBeNull();
    });

    it('allows SVG only in image_with_svg mode and PDF in receipt mode', () => {
      expect(
        validateUploadFile({ originalname: 'logo.svg', mimetype: 'image/svg+xml' }, 'image_with_svg'),
      ).toBeNull();
      expect(
        validateUploadFile({ originalname: 'ticket.pdf', mimetype: 'application/pdf' }, 'receipt'),
      ).toBeNull();
      expect(
        validateUploadFile({ originalname: 'script.js', mimetype: 'application/javascript' }, 'receipt'),
      ).not.toBeNull();
    });

    it('blocks dangerous scripts/executables in document_or_image mode while allowing business files', () => {
      expect(
        validateUploadFile({ originalname: 'ficha.pdf', mimetype: 'application/pdf' }, 'document_or_image'),
      ).toBeNull();
      expect(
        validateUploadFile({ originalname: 'plano.dwg', mimetype: 'application/acad' }, 'document_or_image'),
      ).toBeNull();
      expect(
        validateUploadFile({ originalname: 'payload.exe', mimetype: 'application/x-msdownload' }, 'document_or_image'),
      ).not.toBeNull();
      expect(
        validateUploadFile({ originalname: 'xss.html', mimetype: 'text/html' }, 'document_or_image'),
      ).not.toBeNull();
      expect(
        validateUploadFile({ originalname: 'xss.svg', mimetype: 'image/svg+xml' }, 'document_or_image'),
      ).not.toBeNull();
    });

    it('supports dynamic mode resolver per request URL (cover-image vs files)', () => {
      const filter = createMulterFileFilter((req) =>
        req.originalUrl?.includes('/cover-image') ? 'image' : 'document_or_image',
      );

      const coverPdfCb = jest.fn();
      filter(
        { originalUrl: '/api/products/abc/cover-image' },
        { originalname: 'manual.pdf', mimetype: 'application/pdf' },
        coverPdfCb,
      );
      expect(coverPdfCb.mock.calls[0][0]).toBeInstanceOf(BadRequestException);
      expect(coverPdfCb.mock.calls[0][1]).toBe(false);

      const filesPdfCb = jest.fn();
      filter(
        { originalUrl: '/api/products/abc/files' },
        { originalname: 'manual.pdf', mimetype: 'application/pdf' },
        filesPdfCb,
      );
      expect(filesPdfCb).toHaveBeenCalledWith(null, true);
    });
  });

  describe('assertSafeUploadParamId', () => {
    it('accepts valid IDs and rejects missing or traversal IDs', () => {
      expect(assertSafeUploadParamId('aabb0b7f-44a4-47ac-b35e-cb2db3e75a87', 'Product ID')).toBe(
        'aabb0b7f-44a4-47ac-b35e-cb2db3e75a87',
      );
      expect(() => assertSafeUploadParamId('', 'Product ID')).toThrow(BadRequestException);
      expect(() => assertSafeUploadParamId('../etc', 'Product ID')).toThrow(BadRequestException);
    });
  });
});
