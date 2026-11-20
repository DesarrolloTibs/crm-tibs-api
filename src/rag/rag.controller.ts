import {
  Controller,
  Post,
  Get,
  Body,
  Query,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  ForbiddenException,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { RagService } from './rag.service';
import { SearchRagQueryDto, UploadRagDto } from './dto/rag.dto';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { User } from '../users/entities/user.entity';
import { Role } from '../role.enum';

@ApiTags('rag')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('rag')
export class RagController {
  constructor(private readonly ragService: RagService) {}

  /**
   * Carga una ficha técnica en PDF para un producto y genera sus embeddings vectoriales.
   */
  @Post('upload')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 20 * 1024 * 1024 } }))
  async uploadPdf(
    @UploadedFile() file: Express.Multer.File,
    @Body() body: UploadRagDto,
    @GetUser() user: User,
  ) {
    const role = (user?.role || '').toString().toLowerCase().trim();
    if (role !== Role.Admin && role !== Role.SuperAdmin) {
      throw new ForbiddenException('Solo los administradores pueden cargar documentos al repositorio RAG.');
    }

    if (!file || !file.buffer || file.buffer.length === 0) {
      throw new BadRequestException('El archivo PDF es obligatorio.');
    }
    const isPdf =
      file.mimetype === 'application/pdf' ||
      file.originalname.toLowerCase().endsWith('.pdf');
    if (!isPdf) {
      throw new BadRequestException('Solo se permiten archivos en formato PDF.');
    }

    try {
      const chunksCount = await this.ragService.ingestPdf(
        file.buffer,
        file.originalname,
        body.productKey.trim(),
      );

      return {
        status: 'SUCCESS',
        message: 'Ficha técnica procesada e indexada con éxito.',
        fileName: file.originalname,
        productKey: body.productKey.trim(),
        chunksIngested: chunksCount,
      };
    } catch (error: any) {
      throw new BadRequestException(`Error procesando PDF: ${error.message}`);
    }
  }

  /**
   * Realiza una prueba de consulta RAG para buscar fragmentos semánticamente similares.
   */
  @Get('search')
  async search(@Query() queryDto: SearchRagQueryDto) {
    const parsedLimit = queryDto.limit ?? 3;

    try {
      const results = await this.ragService.searchSimilar(
        queryDto.query.trim(),
        parsedLimit,
        queryDto.productKey?.trim(),
      );

      return {
        status: 'SUCCESS',
        query: queryDto.query.trim(),
        resultsCount: results.length,
        results,
      };
    } catch (error: any) {
      throw new BadRequestException(`Error realizando búsqueda semántica: ${error.message}`);
    }
  }
}
