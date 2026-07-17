import { 
  Controller, 
  Post, 
  Get, 
  Body, 
  Query, 
  UseInterceptors, 
  UploadedFile, 
  BadRequestException, 
  HttpCode,
  HttpStatus
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { RagService } from './rag.service';

@Controller('rag')
export class RagController {
  constructor(private readonly ragService: RagService) {}

  /**
   * Carga una ficha técnica en PDF para un producto y genera sus embeddings vectoriales.
   */
  @Post('upload')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('file'))
  async uploadPdf(
    @UploadedFile() file: Express.Multer.File,
    @Body('productKey') productKey: string,
  ) {
    if (!file) {
      throw new BadRequestException('El archivo PDF es obligatorio.');
    }
    if (!productKey) {
      throw new BadRequestException('El identificador del producto (productKey) es obligatorio.');
    }

    try {
      const chunksCount = await this.ragService.ingestPdf(
        file.buffer,
        file.originalname,
        productKey
      );

      return {
        status: 'SUCCESS',
        message: 'Ficha técnica procesada e indexada con éxito.',
        fileName: file.originalname,
        productKey,
        chunksIngested: chunksCount
      };
    } catch (error: any) {
      throw new BadRequestException(`Error procesando PDF: ${error.message}`);
    }
  }

  /**
   * Realiza una prueba de consulta RAG para buscar fragmentos semánticamente similares.
   */
  @Get('search')
  async search(
    @Query('query') query: string,
    @Query('limit') limit?: string,
    @Query('productKey') productKey?: string,
  ) {
    if (!query) {
      throw new BadRequestException('El parámetro query es obligatorio.');
    }

    const parsedLimit = limit ? parseInt(limit, 10) : 3;

    try {
      const results = await this.ragService.searchSimilar(
        query,
        parsedLimit,
        productKey
      );

      return {
        status: 'SUCCESS',
        query,
        resultsCount: results.length,
        results
      };
    } catch (error: any) {
      throw new BadRequestException(`Error realizando búsqueda semántica: ${error.message}`);
    }
  }
}
