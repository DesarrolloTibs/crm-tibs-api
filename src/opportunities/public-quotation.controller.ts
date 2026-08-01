import { Controller, Get, Param, ParseUUIDPipe, Res, NotFoundException } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import type { Response } from 'express';
import { QuotationPdfService } from './quotation-pdf.service';
import { OpportunitiesService } from './opportunities.service';

@ApiTags('public-quotations')
@Controller('public/quotations')
export class PublicQuotationController {
  constructor(
    private readonly quotationPdfService: QuotationPdfService,
    private readonly opportunitiesService: OpportunitiesService,
  ) {}

  @Get(':id')
  @ApiOperation({ summary: 'Ver o descargar PDF de cotización público por ID de Oportunidad' })
  async downloadPublicPdf(
    @Param('id', ParseUUIDPipe) id: string,
    @Res() res: Response,
  ) {
    try {
      const result = await this.quotationPdfService.generateQuotationPdf(id);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="${result.fileName}"`);
      return this.opportunitiesService.downloadFile(result.filePath, result.fileName, res);
    } catch (err) {
      throw new NotFoundException(`No se pudo generar o encontrar la cotización para la oportunidad ${id}.`);
    }
  }
}
