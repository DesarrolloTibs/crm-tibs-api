import { Injectable, InternalServerErrorException, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BlobServiceClient, ContainerClient } from '@azure/storage-blob';
import { existsSync, unlinkSync, mkdirSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import type { Response } from 'express';

@Injectable()
export class StorageService {
  private readonly logger = new Logger('StorageService');
  private blobServiceClient: BlobServiceClient | null = null;
  private containerClient: ContainerClient | null = null;
  private storageType: string;
  private connectionString: string;
  private containerName: string;

  constructor(private readonly configService: ConfigService) {
    this.storageType = this.configService.get<string>('STORAGE_TYPE') || 'local';

    if (this.storageType === 'azure') {
      this.connectionString = this.configService.get<string>('AZURE_STORAGE_CONNECTION_STRING') || '';
      this.containerName = this.configService.get<string>('AZURE_STORAGE_CONTAINER') || 'uploads';

      if (!this.connectionString) {
        throw new InternalServerErrorException(
          'AZURE_STORAGE_CONNECTION_STRING is not set in environment variables',
        );
      }

      try {
        this.blobServiceClient = BlobServiceClient.fromConnectionString(this.connectionString);
        this.containerClient = this.blobServiceClient.getContainerClient(this.containerName);
      } catch (err) {
        this.logger.error('Failed to initialize Azure Blob Service Client:', err);
      }
    }
  }

  isAzure(): boolean {
    return this.storageType === 'azure';
  }

  async uploadFile(localPath: string, destPath: string): Promise<string> {
    const normalizedDestPath = destPath.replace(/\\/g, '/');
    if (!this.isAzure()) {
      return normalizedDestPath;
    }

    if (!this.containerClient) {
      throw new InternalServerErrorException('Azure Blob Service Client is not initialized');
    }

    try {
      const absoluteLocalPath = join(process.cwd(), localPath);
      if (!existsSync(absoluteLocalPath)) {
        throw new NotFoundException(`Local file to upload not found: ${absoluteLocalPath}`);
      }

      await this.containerClient.createIfNotExists();

      let blobName = normalizedDestPath;
      if (blobName.startsWith('./')) {
        blobName = blobName.substring(2);
      }
      if (blobName.startsWith('/')) {
        blobName = blobName.substring(1);
      }

      const blockBlobClient = this.containerClient.getBlockBlobClient(blobName);
      await blockBlobClient.uploadFile(absoluteLocalPath);

      // Eliminar el archivo local después de subirlo a Azure
      try {
        unlinkSync(absoluteLocalPath);
      } catch (err) {
        this.logger.error(
          `Failed to delete local temp file ${absoluteLocalPath} after uploading to Azure: ${err.message}`,
        );
      }

      return normalizedDestPath;
    } catch (err) {
      this.logger.error(`Azure upload failed for file ${localPath}: ${err.message}`);
      throw new InternalServerErrorException(`Azure storage upload error: ${err.message}`);
    }
  }

  /**
   * Guarda un búfer binario directamente en almacenamiento local o Azure Blob Storage.
   * Crea automáticamente los directorios necesarios y retorna la ruta pública/relativa.
   */
  async saveBuffer(buffer: Buffer, destPath: string, mimeType?: string): Promise<string> {
    const normalizedDestPath = destPath.replace(/\\/g, '/');
    let relativePath = normalizedDestPath;
    if (relativePath.startsWith('/')) {
      relativePath = relativePath.substring(1);
    }
    if (relativePath.startsWith('./')) {
      relativePath = relativePath.substring(2);
    }

    if (this.isAzure()) {
      if (!this.containerClient) {
        throw new InternalServerErrorException('Azure Blob Service Client is not initialized');
      }
      try {
        await this.containerClient.createIfNotExists();
        const blockBlobClient = this.containerClient.getBlockBlobClient(relativePath);
        await blockBlobClient.uploadData(buffer, {
          blobHTTPHeaders: {
            blobContentType: mimeType || 'application/octet-stream',
          },
        });
        return normalizedDestPath.startsWith('/') ? normalizedDestPath : `/${normalizedDestPath}`;
      } catch (err: any) {
        this.logger.error(`Azure uploadData failed for buffer ${destPath}: ${err.message}`);
        throw new InternalServerErrorException(`Azure storage upload error: ${err.message}`);
      }
    } else {
      try {
        const absolutePath = join(process.cwd(), relativePath);
        const parentDir = dirname(absolutePath);
        if (!existsSync(parentDir)) {
          mkdirSync(parentDir, { recursive: true });
        }
        writeFileSync(absolutePath, buffer);
        return normalizedDestPath.startsWith('/') ? normalizedDestPath : `/${normalizedDestPath}`;
      } catch (err: any) {
        this.logger.error(`Local file write failed for ${destPath}: ${err.message}`);
        throw new InternalServerErrorException(`Local storage save error: ${err.message}`);
      }
    }
  }

  async deleteFile(filePath: string): Promise<void> {
    const normalizedPath = filePath.replace(/\\/g, '/');
    let relativePath = normalizedPath;
    if (relativePath.startsWith('/')) {
      relativePath = relativePath.substring(1);
    }
    if (relativePath.startsWith('./')) {
      relativePath = relativePath.substring(2);
    }

    if (this.isAzure()) {
      if (!this.containerClient) {
        throw new InternalServerErrorException('Azure Blob Service Client is not initialized');
      }

      try {
        const blockBlobClient = this.containerClient.getBlockBlobClient(relativePath);
        await blockBlobClient.deleteIfExists();
      } catch (err) {
        this.logger.error(`Failed to delete file from Azure: ${relativePath} — ${err.message}`);
      }
    } else {
      const absolutePath = join(process.cwd(), relativePath);
      if (existsSync(absolutePath)) {
        try {
          unlinkSync(absolutePath);
        } catch (err) {
          this.logger.error(`Failed to delete local file: ${absolutePath} — ${err.message}`);
        }
      }
    }
  }

  async downloadFile(filePath: string, res: Response, fileName?: string): Promise<void> {
    const normalizedPath = filePath.replace(/\\/g, '/');
    let relativePath = normalizedPath;
    if (relativePath.startsWith('/')) {
      relativePath = relativePath.substring(1);
    }
    if (relativePath.startsWith('./')) {
      relativePath = relativePath.substring(2);
    }

    if (this.isAzure()) {
      if (!this.containerClient) {
        throw new InternalServerErrorException('Azure Blob Service Client is not initialized');
      }

      try {
        const blockBlobClient = this.containerClient.getBlockBlobClient(relativePath);
        const downloadResponse = await blockBlobClient.download(0);

        if (fileName) {
          res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fileName)}"`);
        }
        res.setHeader('Content-Type', downloadResponse.contentType || 'application/octet-stream');
        if (downloadResponse.contentLength) {
          res.setHeader('Content-Length', downloadResponse.contentLength);
        }

        if (downloadResponse.readableStreamBody) {
          downloadResponse.readableStreamBody.pipe(res);
        } else {
          res.status(500).send('Unable to read file stream from Azure Storage');
        }
      } catch (err) {
        this.logger.error(`Failed to stream file from Azure: ${relativePath} — ${err.message}`);
        res.status(404).send('File not found in Azure Storage');
      }
    } else {
      const absolutePath = join(process.cwd(), relativePath);
      if (existsSync(absolutePath)) {
        if (fileName) {
          res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fileName)}"`);
        }
        res.sendFile(absolutePath);
      } else {
        res.status(404).send('File not found locally');
      }
    }
  }
}
