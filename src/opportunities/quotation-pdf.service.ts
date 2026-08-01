import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { Opportunity } from './entities/opportunity.entity';
import { StorageService } from '../storage/storage.service';
import { Conversation } from '../conversations/entities/conversation.entity';
import { existsSync, mkdirSync, createWriteStream, readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import PDFDocument from 'pdfkit';
import sharp from 'sharp';
import { CONVERSATION_EVENTS } from '../common/events/conversation.events';
import { QUOTATION_EVENTS, QuotationSendPayload } from '../common/events/quotation.events';
import { TenantContextService } from '../tenancy/tenant-context.service';

@Injectable()
export class QuotationPdfService {
  private readonly logger = new Logger('QuotationPdfService');

  constructor(
    @InjectRepository(Opportunity)
    private readonly opportunityRepository: Repository<Opportunity>,
    private readonly storageService: StorageService,
    private readonly dataSource: DataSource,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * Genera un PDF de cotización a partir de los datos de una oportunidad.
   * El precio unitario se toma del precioBase del producto.
   * La cantidad se toma del campo cantidad de OpportunityProduct.
   */
  async generateQuotationPdf(opportunityId: string): Promise<{ filePath: string; fileName: string; absolutePath: string }> {
    // 1. Cargar la oportunidad con productos
    const opportunity = await this.opportunityRepository.findOne({
      where: { id: opportunityId },
      relations: ['cliente', 'company', 'ejecutivo', 'opportunityProducts', 'opportunityProducts.product'],
    });

    if (!opportunity) {
      throw new NotFoundException(`Oportunidad con ID "${opportunityId}" no encontrada.`);
    }

    // 2. Obtener datos del tenant (logo y nombre de empresa) del esquema activo de la request
    const activeSchema = TenantContextService.getTenantSchema() || 'public';
    let tenantName = '';
    let tenantLogoPath: string | null = null;
    try {
      const tenantResult = await this.dataSource.query(
        `SELECT name, logo FROM public.tenants WHERE schema_name = $1 LIMIT 1`,
        [activeSchema]
      );
      if (tenantResult && tenantResult.length > 0) {
        tenantName = tenantResult[0].name || '';
        tenantLogoPath = tenantResult[0].logo || null;
      }
    } catch (err) {
      this.logger.warn(`No se pudo obtener información del tenant: ${err.message}`);
    }

    // 3. Preparar datos de partidas
    const items = (opportunity.opportunityProducts || [])
      .sort((a, b) => {
        const nameA = a.product?.nombre || '';
        const nameB = b.product?.nombre || '';
        return nameA.localeCompare(nameB);
      })
      .map((op, index) => {
        const product = op.product;
        const cantidad = Number(op.cantidad) || 1;
        const precioUnitario = Number(product?.precioBase) || 0;
        const subtotal = cantidad * precioUnitario;
        return {
          index: index + 1,
          nombre: product?.nombre || 'Producto sin nombre',
          descripcion: product?.descripcion || null,
          cantidad,
          unidadMedida: product?.unidadMedida || 'Pieza',
          precioUnitario,
          subtotal,
          observaciones: product?.observaciones || null,
        };
      });

    const total = items.reduce((sum, item) => sum + item.subtotal, 0);
    const moneda = opportunity.moneda || 'MXN';
    const currencySymbol = moneda === 'USD' ? 'USD $' : '$';

    // Nombre del cliente
    const clientName = opportunity.cliente
      ? `${opportunity.cliente.nombre || ''} ${opportunity.cliente.apellido || ''}`.trim()
      : 'Cliente';

    // Fecha
    const now = new Date();
    const dateStr = now.toLocaleDateString('es-MX', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    // 4. Crear el PDF
    const uploadDir = join(process.cwd(), 'uploads', 'quotations', opportunityId);
    if (!existsSync(uploadDir)) {
      mkdirSync(uploadDir, { recursive: true });
    }

    const fileName = `cotizacion-${Date.now()}.pdf`;
    const absolutePath = join(uploadDir, fileName);
    const relativePath = `uploads/quotations/${opportunityId}/${fileName}`;

    await this.renderPdf(absolutePath, {
      tenantName,
      tenantLogoPath,
      clientName,
      dateStr,
      items,
      total,
      currencySymbol,
      moneda,
      opportunityName: opportunity.nombre_proyecto,
    });

    // 5. Subir a storage si es Azure
    const storedPath = await this.storageService.uploadFile(relativePath, relativePath);

    // 6. Actualizar proposal_document_path en la oportunidad en BD
    try {
      const activeSchema = TenantContextService.getTenantSchema() || 'public';
      await this.dataSource.query(
        `UPDATE "${activeSchema}".opportunities SET proposal_document_path = $1 WHERE id = $2`,
        [storedPath, opportunityId]
      );
    } catch (updateErr) {
      this.logger.warn(`No se pudo actualizar proposal_document_path en DB: ${(updateErr as Error).message}`);
    }

    this.logger.log(`PDF de cotización generado: ${storedPath}`);

    return {
      filePath: storedPath,
      fileName,
      absolutePath,
    };
  }

  /**
   * Listener de evento para generación y envío de PDF.
   * Permite que AiAgentService dispare la generación sin importar QuotationPdfService directamente.
   */
  @OnEvent(QUOTATION_EVENTS.SEND_TO_CHANNEL)
  async handleSendQuotationToChannel(payload: { opportunityId: string; conversationId: string }): Promise<void> {
    try {
      await this.sendQuotationToChannel(payload.opportunityId, payload.conversationId);
    } catch (err) {
      this.logger.error(`Error procesando evento ${QUOTATION_EVENTS.SEND_TO_CHANNEL}: ${(err as Error).message}`);
    }
  }

  /**
   * Genera el PDF de cotización y lo envía directamente por el canal activo de la conversación.
   */
  async sendQuotationToChannel(opportunityId: string, conversationId: string): Promise<{ success: boolean; filePath: string }> {
    const pdfResult = await this.generateQuotationPdf(opportunityId);

    const conversationRepo = this.opportunityRepository.manager.getRepository(Conversation);
    const conversation = await conversationRepo.findOne({ where: { id: conversationId } });

    if (!conversation) {
      throw new NotFoundException(`Conversación con ID "${conversationId}" no encontrada.`);
    }

    const caption = `Aquí tienes la cotización en PDF para tu proyecto.`;
    this.eventEmitter.emit(CONVERSATION_EVENTS.SEND_DOCUMENT_TO_CHANNEL, {
      conversation,
      filePath: pdfResult.filePath,
      fileName: pdfResult.fileName,
      caption,
    });

    return {
      success: true,
      filePath: pdfResult.filePath,
    };
  }

  /**
   * Renderiza el PDF con PDFKit usando el template fijo TIBS.
   */
  /**
   * Renderiza el PDF de cotización con PDFKit usando un diseño ejecutivo moderno.
   */
  private async renderPdf(
    outputPath: string,
    data: {
      tenantName: string;
      tenantLogoPath: string | null;
      clientName: string;
      dateStr: string;
      items: Array<{
        index: number;
        nombre: string;
        descripcion: string | null;
        cantidad: number;
        unidadMedida: string;
        precioUnitario: number;
        subtotal: number;
        observaciones: string | null;
      }>;
      total: number;
      currencySymbol: string;
      moneda: string;
      opportunityName: string;
    },
  ): Promise<void> {
    return new Promise(async (resolve, reject) => {
      try {
        const doc = new PDFDocument({
          size: 'LETTER',
          margin: 40,
          bufferPages: true,
          info: {
            Title: `Cotización - ${data.opportunityName}`,
            Author: data.tenantName,
          },
        });

        const stream = createWriteStream(outputPath);
        doc.pipe(stream);

        const pageWidth = doc.page.width;
        const marginLeft = 40;
        const marginRight = 40;
        const contentWidth = pageWidth - marginLeft - marginRight;

        // ── RESOLVER RUTA DEL LOGO DE LA EMPRESA ──
        let resolvedLogoPath: string | null = null;
        if (data.tenantLogoPath) {
          const cleanPath = data.tenantLogoPath.replace(/\\/g, '/').replace(/^\//, '');
          const possiblePaths = [
            data.tenantLogoPath,
            join(process.cwd(), cleanPath),
            join(process.cwd(), 'uploads', cleanPath.replace(/^uploads\//, '')),
          ];
          for (const p of possiblePaths) {
            if (existsSync(p)) {
              resolvedLogoPath = p;
              break;
            }
          }
        }

        let headerY = 40;

        // ── BARRA SUPERIOR DE ACENTO DE MARCA (INDIGO ACCENT BAR) ──
        doc.rect(marginLeft, headerY, contentWidth, 4).fill('#2563EB');
        headerY += 14;

        // ── CABECERA: LOGO / INSIGNIA Y TITULO COTIZACIÓN ──
        const logoWidth = 140;
        const logoHeight = 48;

        let imageSource: Buffer | string | null = null;
        if (resolvedLogoPath) {
          try {
            // PDFKit no soporta SVG o WebP nativamente. Si es SVG, WebP o formato no nativo,
            // renderizamos a un Buffer PNG de alta resolución mediante sharp (300 DPI).
            if (/\.(svg|webp|gif|tiff|bmp)$/i.test(resolvedLogoPath)) {
              imageSource = await sharp(resolvedLogoPath, { density: 300 }).png().toBuffer();
            } else {
              imageSource = resolvedLogoPath;
            }
          } catch (sharpErr) {
            this.logger.warn(`No se pudo procesar formato de logo con sharp: ${sharpErr.message}`);
            imageSource = null;
          }
        }

        let logoRendered = false;
        if (imageSource) {
          try {
            doc.image(imageSource, marginLeft, headerY, { fit: [logoWidth, logoHeight] });
            logoRendered = true;
          } catch (logoErr) {
            this.logger.warn(`Error al renderizar logo en PDFKit: ${logoErr.message}`);
          }
        }

        // Si no hay logo o falló el renderizado, desplegar el nombre exacto de la empresa sin avatares ni defaults
        if (!logoRendered && data.tenantName) {
          doc.fontSize(16).font('Helvetica-Bold').fillColor('#0F172A')
            .text(data.tenantName, marginLeft, headerY + 12);
        }

        // BADGE DE COTIZACIÓN EN LA PARTE SUPERIOR DERECHA
        const badgeWidth = 170;
        const badgeX = pageWidth - marginRight - badgeWidth;
        doc.roundedRect(badgeX, headerY - 2, badgeWidth, 48, 6).fill('#EFF6FF');
        doc.fontSize(13).font('Helvetica-Bold').fillColor('#1D4ED8')
          .text('COTIZACIÓN', badgeX + 10, headerY + 6, { width: badgeWidth - 20, align: 'right' });
        doc.fontSize(8.5).font('Helvetica').fillColor('#475569')
          .text(`Fecha: ${data.dateStr}`, badgeX + 10, headerY + 26, { width: badgeWidth - 20, align: 'right' });

        headerY += 58;

        // ── TARJETA DE INFORMACIÓN DEL CLIENTE Y PROYECTO ──
        const cardHeight = 58;
        doc.roundedRect(marginLeft, headerY, contentWidth, cardHeight, 6)
          .fillAndStroke('#F8FAFC', '#E2E8F0');

        // Columna Izquierda: Cliente y Proyecto
        const leftColX = marginLeft + 14;
        let cardTextY = headerY + 10;
        doc.fontSize(7.5).font('Helvetica-Bold').fillColor('#2563EB')
          .text('INFORMACIÓN DE LA COTIZACIÓN', leftColX, cardTextY);
        cardTextY += 12;
        doc.fontSize(9.5).font('Helvetica-Bold').fillColor('#0F172A')
          .text(`Proyecto / Asunto: `, leftColX, cardTextY, { continued: true })
          .font('Helvetica').fillColor('#334155').text(data.opportunityName);
        cardTextY += 13;
        doc.fontSize(9.5).font('Helvetica-Bold').fillColor('#0F172A')
          .text(`Cliente: `, leftColX, cardTextY, { continued: true })
          .font('Helvetica').fillColor('#334155').text(data.clientName);

        // Columna Derecha: Moneda
        const rightColX = marginLeft + contentWidth * 0.65;
        let rightCardY = headerY + 10;
        doc.fontSize(7.5).font('Helvetica-Bold').fillColor('#2563EB')
          .text('CONDICIONES', rightColX, rightCardY);
        rightCardY += 12;
        doc.fontSize(9.5).font('Helvetica-Bold').fillColor('#0F172A')
          .text(`Moneda: `, rightColX, rightCardY, { continued: true })
          .font('Helvetica-Bold').fillColor('#1E40AF').text(`${data.moneda} (${data.currencySymbol})`);

        headerY += cardHeight + 16;

        // ── TABLA DE PARTIDAS ──
        const colNum = marginLeft + 8;
        const colProduct = marginLeft + 32;
        const colQty = marginLeft + contentWidth * 0.50;
        const colUnit = marginLeft + contentWidth * 0.60;
        const colPrice = marginLeft + contentWidth * 0.72;
        const colSubtotal = marginLeft + contentWidth * 0.86;

        // Encabezado de Tabla
        let tableY = headerY;
        const headerHeight = 22;

        // Fondo oscuro estilizado para los encabezados de tabla
        doc.roundedRect(marginLeft, tableY, contentWidth, headerHeight, 4).fill('#1E293B');

        doc.fontSize(8.5).font('Helvetica-Bold').fillColor('#FFFFFF');
        doc.text('#', colNum, tableY + 6, { width: 20 });
        doc.text('Producto / Descripción', colProduct, tableY + 6, { width: colQty - colProduct - 5 });
        doc.text('Cant.', colQty, tableY + 6, { width: colUnit - colQty - 5, align: 'right' });
        doc.text('Unidad', colUnit, tableY + 6, { width: colPrice - colUnit - 5 });
        doc.text('P.U.', colPrice, tableY + 6, { width: colSubtotal - colPrice - 5, align: 'right' });
        doc.text('Subtotal', colSubtotal, tableY + 6, { width: pageWidth - marginRight - colSubtotal - 8, align: 'right' });

        tableY += headerHeight + 4;

        // Recopilar notas con numeración
        const notesWithIndex: Array<{ noteIndex: number; text: string }> = [];
        let noteCounter = 0;

        // Filas de la tabla
        for (const item of data.items) {
          if (tableY > doc.page.height - 140) {
            doc.addPage();
            tableY = 40;
          }

          let noteRef = '';
          if (item.observaciones && item.observaciones.trim()) {
            noteCounter++;
            notesWithIndex.push({ noteIndex: noteCounter, text: item.observaciones.trim() });
            noteRef = ` ${this.getSuperscript(noteCounter)}`;
          }

          const hasDesc = item.descripcion && item.descripcion.trim().length > 0;
          const rowHeight = hasDesc ? 28 : 20;

          // Fondo alternado de fila
          if (item.index % 2 === 0) {
            doc.rect(marginLeft, tableY - 2, contentWidth, rowHeight).fill('#F8FAFC');
          }

          // Texto número de partida
          doc.fontSize(9).font('Helvetica').fillColor('#475569')
            .text(String(item.index), colNum, tableY + 3, { width: 20 });

          // Texto Producto + Nota
          doc.fontSize(9).font('Helvetica-Bold').fillColor('#0F172A')
            .text(`${item.nombre}${noteRef}`, colProduct, tableY + 3, { width: colQty - colProduct - 5 });

          if (hasDesc) {
            doc.fontSize(7.5).font('Helvetica-Oblique').fillColor('#64748B')
              .text(item.descripcion!.trim(), colProduct, tableY + 15, { width: colQty - colProduct - 5, height: 10 });
          }

          // Cantidad, Unidad, Precio, Subtotal
          doc.fontSize(9).font('Helvetica').fillColor('#334155');
          doc.text(this.formatNumber(item.cantidad), colQty, tableY + 3, { width: colUnit - colQty - 5, align: 'right' });
          doc.text(item.unidadMedida, colUnit, tableY + 3, { width: colPrice - colUnit - 5 });
          doc.text(`${data.currencySymbol}${this.formatCurrency(item.precioUnitario)}`, colPrice, tableY + 3, { width: colSubtotal - colPrice - 5, align: 'right' });
          doc.fontSize(9).font('Helvetica-Bold').fillColor('#0F172A')
            .text(`${data.currencySymbol}${this.formatCurrency(item.subtotal)}`, colSubtotal, tableY + 3, { width: pageWidth - marginRight - colSubtotal - 8, align: 'right' });

          tableY += rowHeight + 2;
        }

        // Línea divisoria de tabla
        tableY += 4;
        doc.moveTo(marginLeft, tableY).lineTo(pageWidth - marginRight, tableY)
          .strokeColor('#CBD5E1').lineWidth(0.8).stroke();
        tableY += 12;

        // ── CUADRO DE TOTALES ──
        if (tableY > doc.page.height - 120) {
          doc.addPage();
          tableY = 40;
        }

        const totalBoxWidth = 220;
        const totalBoxHeight = 36;
        const totalBoxX = pageWidth - marginRight - totalBoxWidth;

        doc.roundedRect(totalBoxX, tableY, totalBoxWidth, totalBoxHeight, 6)
          .fillAndStroke('#EFF6FF', '#2563EB');

        doc.fontSize(11).font('Helvetica-Bold').fillColor('#1E3A8A')
          .text('TOTAL:', totalBoxX + 12, tableY + 11);
        doc.fontSize(13).font('Helvetica-Bold').fillColor('#1D4ED8')
          .text(`${data.currencySymbol}${this.formatCurrency(data.total)} ${data.moneda}`, totalBoxX + 60, tableY + 10, {
            width: totalBoxWidth - 72,
            align: 'right',
          });

        tableY += totalBoxHeight + 20;

        // ── NOTAS/OBSERVACIONES DE PRODUCTOS ──
        if (notesWithIndex.length > 0) {
          if (tableY > doc.page.height - 110) {
            doc.addPage();
            tableY = 40;
          }

          doc.fontSize(8.5).font('Helvetica-Bold').fillColor('#475569')
            .text('Notas y Condiciones del Producto:', marginLeft, tableY);
          tableY += 14;

          doc.fontSize(8).font('Helvetica').fillColor('#64748B');
          for (const note of notesWithIndex) {
            if (tableY > doc.page.height - 70) {
              doc.addPage();
              tableY = 40;
            }
            doc.text(`${this.getSuperscript(note.noteIndex)} ${note.text}`, marginLeft + 8, tableY, {
              width: contentWidth - 16,
            });
            tableY += doc.heightOfString(`${this.getSuperscript(note.noteIndex)} ${note.text}`, {
              width: contentWidth - 16,
            }) + 4;
          }
          tableY += 10;
        }

        // ── LEYENDA DE IMPUESTOS Y PIE DE PÁGINA ──
        if (tableY > doc.page.height - 60) {
          doc.addPage();
          tableY = 40;
        }

        doc.moveTo(marginLeft, tableY).lineTo(pageWidth - marginRight, tableY)
          .strokeColor('#E2E8F0').lineWidth(0.5).stroke();
        tableY += 10;

        doc.fontSize(8).font('Helvetica-Oblique').fillColor('#64748B')
          .text('* Los precios mostrados no incluyen impuestos.', marginLeft, tableY, { width: contentWidth });

        // Finalizar
        doc.end();

        stream.on('finish', () => resolve());
        stream.on('error', (err) => reject(err));
      } catch (err) {
        reject(err);
      }
    });
  }

  /** Formatea un número como moneda (miles separados por coma, 2 decimales). */
  private formatCurrency(amount: number): string {
    return amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  /** Formatea un número genérico (sin decimales innecesarios). */
  private formatNumber(num: number): string {
    if (Number.isInteger(num)) return String(num);
    return num.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  }

  /** Retorna el superscript Unicode para el índice de nota. */
  private getSuperscript(index: number): string {
    const superscripts: Record<string, string> = {
      '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴',
      '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹',
    };
    return String(index).split('').map(d => superscripts[d] || d).join('');
  }
}
