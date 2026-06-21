import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { Response } from 'express';

import { Product } from './entities/product.entity';
import { ProductFile } from './entities/product-file.entity';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { User } from 'src/users/entities/user.entity';
import { StorageService } from '../storage/storage.service';

@Injectable()
export class ProductsService {
  constructor(
    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>,
    @InjectRepository(ProductFile)
    private readonly productFileRepository: Repository<ProductFile>,
    private readonly storageService: StorageService,
  ) {}

  async create(createProductDto: CreateProductDto, currentUser: User): Promise<Product> {
    const userId = currentUser.id || (currentUser as any).userId;
    const product = this.productRepository.create({
      ...createProductDto,
      createdById: userId || null,
    });
    return this.productRepository.save(product);
  }

  findAll(): Promise<Product[]> {
    return this.productRepository.find({
      relations: ['createdBy', 'files'],
      order: {
        createdAt: 'DESC',
      },
    });
  }

  async findOne(id: string): Promise<Product> {
    const product = await this.productRepository.findOne({
      where: { id },
      relations: ['createdBy', 'files'],
    });
    if (!product) {
      throw new NotFoundException(`Product with ID "${id}" not found`);
    }
    return product;
  }

  async update(id: string, updateProductDto: UpdateProductDto): Promise<Product> {
    const currentProduct = await this.findOne(id);

    if (
      updateProductDto.imagenPortada === null &&
      currentProduct.imagenPortada
    ) {
      await this.storageService.deleteFile(currentProduct.imagenPortada);
    }

    const product = await this.productRepository.preload({
      id,
      ...updateProductDto,
    });
    if (!product) {
      throw new NotFoundException(`Product with ID "${id}" not found`);
    }
    return this.productRepository.save(product);
  }

  async updateStatus(id: string, status: boolean): Promise<Product> {
    const product = await this.findOne(id);
    product.status = status;
    return this.productRepository.save(product);
  }

  async updateCoverImage(id: string, file: Express.Multer.File): Promise<Product> {
    const product = await this.findOne(id);
    if (product.imagenPortada) {
      await this.storageService.deleteFile(product.imagenPortada);
    }
    const relativePath = file.path.replace(/\\/g, '/');
    const imageUrl = await this.storageService.uploadFile(file.path, `/${relativePath}`);
    product.imagenPortada = imageUrl;
    return this.productRepository.save(product);
  }

  async remove(id: string): Promise<void> {
    const product = await this.productRepository.findOne({
      where: { id },
      relations: ['files'],
    });
    if (!product) {
      throw new NotFoundException(`Product with ID "${id}" not found`);
    }

    // 1. Borrar la imagen de portada del servidor
    if (product.imagenPortada) {
      await this.storageService.deleteFile(product.imagenPortada);
    }

    // 2. Borrar todos los archivos adjuntos del servidor
    if (product.files && product.files.length > 0) {
      for (const file of product.files) {
        await this.storageService.deleteFile(file.filePath);
      }
    }

    // 3. Eliminar el registro en la base de datos
    await this.productRepository.remove(product);
  }

  async addProductFile(
    productId: string,
    fileName: string,
    file: Express.Multer.File,
    title?: string,
  ): Promise<Product> {
    await this.findOne(productId); // Verifica que el producto exista

    const relativePath = file.path.replace(/\\/g, '/');
    const filePath = await this.storageService.uploadFile(file.path, relativePath);

    const productFile = this.productFileRepository.create({
      productId,
      fileName,
      filePath,
      title: title || null,
    });

    await this.productFileRepository.save(productFile);
    return this.findOne(productId);
  }

  async getProductFile(productId: string, fileId: string): Promise<ProductFile> {
    const file = await this.productFileRepository.findOne({
      where: { id: fileId, productId },
    });
    if (!file) {
      throw new NotFoundException(`El archivo con ID "${fileId}" no fue encontrado para este producto.`);
    }
    return file;
  }

  async deleteProductFile(productId: string, fileId: string): Promise<Product> {
    const file = await this.getProductFile(productId, fileId);

    await this.storageService.deleteFile(file.filePath);

    await this.productFileRepository.remove(file);
    return this.findOne(productId);
  }

  async downloadFile(filePath: string, fileName: string, res: Response): Promise<void> {
    return this.storageService.downloadFile(filePath, res, fileName);
  }
}
