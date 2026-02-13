import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, UsePipes, ValidationPipe, UseInterceptors, UploadedFile, Res } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { join } from 'path';
import { ExpensesService } from './expenses.service';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { UpdateExpenseDto } from './dto/update-expense.dto';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { User } from '../users/entities/user.entity';

@ApiTags('expenses')
@ApiBearerAuth()
@Controller('expenses')
@UseGuards(AuthGuard('jwt'))
export class ExpensesController {
    constructor(private readonly expensesService: ExpensesService) { }

    @Post()
    create(@Body() createExpenseDto: CreateExpenseDto, @GetUser() user: User) {
        console.log('ExpensesController.create - User:', user);
        return this.expensesService.create(createExpenseDto, user);
    }

    @Get()
    findAll(@GetUser() user: User) {
        return this.expensesService.findAll(user);
    }

    @Get(':id')
    findOne(@Param('id') id: string) {
        return this.expensesService.findOne(id);
    }

    @Patch(':id')
    update(@Param('id') id: string, @Body() updateExpenseDto: UpdateExpenseDto) {
        return this.expensesService.update(id, updateExpenseDto);
    }

    @Delete(':id')
    remove(@Param('id') id: string) {
        return this.expensesService.remove(id);
    }

    @Post(':id/receipt')
    @ApiOperation({ summary: 'Subir o actualizar el comprobante (imagen) para un gasto específico' })
    @ApiConsumes('multipart/form-data')
    @ApiBody({
        description: 'Archivo de imagen del comprobante',
        schema: {
            type: 'object',
            properties: {
                file: { type: 'string', format: 'binary' },
            },
        },
    })
    @UseInterceptors(FileInterceptor('file'))
    async uploadReceipt(
        @Param('id') id: string,
        @UploadedFile() file: Express.Multer.File,
    ) {
        const receiptUrl = `/${file.path.replace(/\\/g, '/')}`;
        return this.expensesService.uploadReceipt(id, receiptUrl);
    }

    @Delete(':id/receipt')
    @ApiOperation({ summary: 'Eliminar el comprobante (imagen)' })
    removeReceipt(@Param('id') id: string) {
        return this.expensesService.removeReceipt(id);
    }

    @Get(':id/receipt/download')
    @ApiOperation({ summary: 'Descargar el comprobante (imagen)' })
    async downloadReceipt(
        @Param('id') id: string,
        @Res() res: Response,
    ) {
        const filePath = await this.expensesService.getReceiptPath(id);
        const absolutePath = join(process.cwd(), filePath);
        return res.sendFile(absolutePath);
    }
}
