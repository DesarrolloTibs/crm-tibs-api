import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import { BlobServiceClient } from '@azure/storage-blob';
import { StorageService } from './storage.service';

jest.mock('@azure/storage-blob', () => ({
  BlobServiceClient: {
    fromConnectionString: jest.fn(),
  },
}));

jest.mock('fs', () => {
  const actual = jest.requireActual('fs');
  return {
    ...actual,
    existsSync: jest.fn((...args: any[]) => actual.existsSync(...args)),
    unlinkSync: jest.fn((...args: any[]) => actual.unlinkSync(...args)),
  };
});

describe('StorageService', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
  });

  function createAzureStorageService() {
    const uploadFileMock = jest.fn().mockResolvedValue({});
    const uploadDataMock = jest.fn().mockResolvedValue({});
    const downloadMock = jest.fn().mockResolvedValue({
      contentType: 'application/octet-stream',
      contentLength: 42,
      readableStreamBody: { pipe: jest.fn() },
    });
    const deleteIfExistsMock = jest.fn().mockResolvedValue({});
    const createIfNotExistsMock = jest.fn().mockResolvedValue({});

    const getBlockBlobClientMock = jest.fn().mockReturnValue({
      uploadFile: uploadFileMock,
      uploadData: uploadDataMock,
      download: downloadMock,
      deleteIfExists: deleteIfExistsMock,
    });

    (BlobServiceClient.fromConnectionString as jest.Mock).mockReturnValue({
      getContainerClient: jest.fn().mockReturnValue({
        createIfNotExists: createIfNotExistsMock,
        getBlockBlobClient: getBlockBlobClientMock,
      }),
    });

    const configService = {
      get: jest.fn((key: string) => {
        if (key === 'STORAGE_TYPE') return 'azure';
        if (key === 'AZURE_STORAGE_CONNECTION_STRING') return 'DefaultEndpointsProtocol=https;AccountName=test;AccountKey=abc==;';
        if (key === 'AZURE_STORAGE_CONTAINER') return 'uploads';
        return undefined;
      }),
    } as unknown as ConfigService;

    const service = new StorageService(configService);
    return {
      service,
      uploadFileMock,
      uploadDataMock,
      downloadMock,
      getBlockBlobClientMock,
    };
  }

  it('sets inferred blobContentType when uploading a file to Azure Blob Storage', async () => {
    (fs.existsSync as jest.Mock).mockReturnValueOnce(true);
    const unlinkSpy = (fs.unlinkSync as jest.Mock).mockImplementationOnce(() => undefined);

    const { service, uploadFileMock, getBlockBlobClientMock } = createAzureStorageService();

    const result = await service.uploadFile(
      './uploads/products/prod-1/cover/1795460846163-Screenshot_2026-08-11_130217.png',
      '/uploads/products/prod-1/cover/1795460846163-Screenshot_2026-08-11_130217.png',
    );

    expect(result).toBe('/uploads/products/prod-1/cover/1795460846163-Screenshot_2026-08-11_130217.png');
    expect(getBlockBlobClientMock).toHaveBeenCalledWith(
      'uploads/products/prod-1/cover/1795460846163-Screenshot_2026-08-11_130217.png',
    );
    expect(uploadFileMock).toHaveBeenCalledWith(
      expect.any(String),
      {
        blobHTTPHeaders: {
          blobContentType: 'image/png',
        },
      },
    );
    expect(unlinkSpy).toHaveBeenCalled();
  });

  it('infers blobContentType in saveBuffer when mimeType is omitted or generic', async () => {
    const { service, uploadDataMock } = createAzureStorageService();

    const saved = await service.saveBuffer(
      Buffer.from('webp-bytes'),
      '/uploads/tenants/1/logo.webp',
      'application/octet-stream',
    );

    expect(saved).toBe('/uploads/tenants/1/logo.webp');
    expect(uploadDataMock).toHaveBeenCalledWith(expect.any(Buffer), {
      blobHTTPHeaders: {
        blobContentType: 'image/webp',
      },
    });
  });

  it('falls back to extension MIME type and decodes %20 when streaming from Azure in downloadFile', async () => {
    const { service, getBlockBlobClientMock } = createAzureStorageService();
    const res = {
      setHeader: jest.fn(),
      status: jest.fn().mockReturnThis(),
      send: jest.fn(),
    } as any;

    await service.downloadFile(
      '/uploads/products/prod-1/cover/1795460846163-Screenshot%202026.png',
      res,
    );

    expect(getBlockBlobClientMock).toHaveBeenCalledWith(
      'uploads/products/prod-1/cover/1795460846163-Screenshot 2026.png',
    );
    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'image/png');
  });

  it('rejects path traversal in downloadFile', async () => {
    const { service } = createAzureStorageService();
    const res = {
      setHeader: jest.fn(),
      status: jest.fn().mockReturnThis(),
      send: jest.fn(),
    } as any;

    await service.downloadFile('/uploads/../../.env', res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.send).toHaveBeenCalledWith('Invalid file path');
  });
});
