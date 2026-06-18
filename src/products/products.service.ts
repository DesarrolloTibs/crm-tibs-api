import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { existsSync, unlinkSync } from 'fs';
import { join } from 'path';

import { Product } from './entities/product.entity';
import { ProductFile } from './entities/product-file.entity';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { User } from 'src/users/entities/user.entity';

@Injectable()
export class ProductsService {
  constructor(
    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>,
    @InjectRepository(ProductFile)
    private readonly productFileRepository: Repository<ProductFile>,
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
      const oldPath = currentProduct.imagenPortada.startsWith('/')
        ? currentProduct.imagenPortada.substring(1)
        : currentProduct.imagenPortada;
      const absolutePath = join(process.cwd(), oldPath);
      if (existsSync(absolutePath)) {
        try {
          unlinkSync(absolutePath);
        } catch (err) {
          console.error(`Error deleting old cover image on update:`, err);
        }
      }
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

  async updateCoverImage(id: string, imageUrl: string): Promise<Product> {
    const product = await this.findOne(id);
    if (product.imagenPortada) {
      // Normalizar ruta para eliminar físicamente la portada anterior
      const oldPath = product.imagenPortada.startsWith('/')
        ? product.imagenPortada.substring(1)
        : product.imagenPortada;
      const absolutePath = join(process.cwd(), oldPath);
      if (existsSync(absolutePath)) {
        try {
          unlinkSync(absolutePath);
        } catch (err) {
          console.error(`Error deleting old product cover image at ${absolutePath}:`, err);
        }
      }
    }
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
      const oldPath = product.imagenPortada.startsWith('/')
        ? product.imagenPortada.substring(1)
        : product.imagenPortada;
      const absolutePath = join(process.cwd(), oldPath);
      if (existsSync(absolutePath)) {
        try {
          unlinkSync(absolutePath);
        } catch (err) {
          console.error(`Error deleting cover image during product removal:`, err);
        }
      }
    }

    // 2. Borrar todos los archivos adjuntos del servidor
    if (product.files && product.files.length > 0) {
      for (const file of product.files) {
        const absolutePath = join(process.cwd(), file.filePath);
        if (existsSync(absolutePath)) {
          try {
            unlinkSync(absolutePath);
          } catch (err) {
            console.error(`Error deleting product attachment file during removal:`, err);
          }
        }
      }
    }

    // 3. Eliminar el registro en la base de datos
    await this.productRepository.remove(product);
  }

  async addProductFile(
    productId: string,
    fileName: string,
    filePath: string,
    title?: string,
  ): Promise<Product> {
    await this.findOne(productId); // Verifica que el producto exista

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

    // Eliminar archivo físico
    const absolutePath = join(process.cwd(), file.filePath);
    if (existsSync(absolutePath)) {
      try {
        unlinkSync(absolutePath);
      } catch (err) {
        console.error(`Error deleting product physical file at ${absolutePath}:`, err);
      }
    }

    await this.productFileRepository.remove(file);
    return this.findOne(productId);
  }
}
