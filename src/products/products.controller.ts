import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  ParseUUIDPipe,
  UsePipes,
  ValidationPipe,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  Res,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AuthGuard } from '@nestjs/passport';
import type { Response } from 'express';
import { join } from 'path';

import { ProductsService } from './products.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto, UpdateProductStatusDto } from './dto/update-product.dto';
import { GetUser } from 'src/auth/decorators/get-user.decorator';
import { User } from 'src/users/entities/user.entity';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiConsumes, ApiBody, ApiCreatedResponse } from '@nestjs/swagger';

@ApiTags('products')
@ApiBearerAuth()
@Controller('products')
@UseGuards(AuthGuard('jwt'))
@UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Post()
  @ApiOperation({ summary: 'Crear un nuevo producto' })
  @ApiCreatedResponse({ description: 'Producto creado exitosamente.' })
  create(@Body() createProductDto: CreateProductDto, @GetUser() user: User) {
    return this.productsService.create(createProductDto, user);
  }

  @Get()
  @ApiOperation({ summary: 'Obtener todos los productos' })
  findAll() {
    return this.productsService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener un producto por ID' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.productsService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Actualizar un producto' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateProductDto: UpdateProductDto,
  ) {
    return this.productsService.update(id, updateProductDto);
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Actualizar el estado del producto (Activo/Inactivo)' })
  updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateProductStatusDto: UpdateProductStatusDto,
  ) {
    return this.productsService.updateStatus(id, updateProductStatusDto.status);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Eliminar un producto' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.productsService.remove(id);
  }

  @Post(':id/cover-image')
  @ApiOperation({ summary: 'Subir o actualizar la imagen de portada de un producto' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    description: 'Archivo de imagen de portada',
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
      },
    },
  })
  @UseInterceptors(FileInterceptor('file'))
  async uploadCoverImage(
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('Se requiere un archivo.');
    }
    // Normalizar ruta para que comience con '/' y use barras correctas
    const imageUrl = `/${file.path.replace(/\\/g, '/')}`;
    return this.productsService.updateCoverImage(id, imageUrl);
  }

  @Post(':id/files')
  @ApiOperation({ summary: 'Subir archivo de ficha técnica para un producto' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    description: 'Archivo y metadatos',
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
        title: { type: 'string' },
      },
    },
  })
  @UseInterceptors(FileInterceptor('file'))
  async uploadFile(
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: Express.Multer.File,
    @Body('title') title?: string,
  ) {
    if (!file) {
      throw new BadRequestException('Se requiere un archivo.');
    }
    const normalizedPath = file.path.replace(/\\/g, '/');
    const decodedFileName = Buffer.from(file.originalname, 'latin1').toString('utf8');
    return this.productsService.addProductFile(id, decodedFileName, normalizedPath, title);
  }

  @Get(':id/files/:fileId/download')
  @ApiOperation({ summary: 'Descargar un archivo de ficha técnica del producto' })
  async downloadFile(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('fileId', ParseUUIDPipe) fileId: string,
    @Res() res: Response,
  ) {
    const file = await this.productsService.getProductFile(id, fileId);
    const normalizedPath = file.filePath.replace(/\\/g, '/');
    const absolutePath = join(process.cwd(), normalizedPath);
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(file.fileName)}"`);
    return res.sendFile(absolutePath);
  }

  @Delete(':id/files/:fileId')
  @ApiOperation({ summary: 'Eliminar un archivo de ficha técnica del producto' })
  async deleteFile(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('fileId', ParseUUIDPipe) fileId: string,
  ) {
    return this.productsService.deleteProductFile(id, fileId);
  }
}
