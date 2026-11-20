import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, UseInterceptors, UploadedFile, Res, ParseUUIDPipe } from '@nestjs/common';
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

        return this.expensesService.create(createExpenseDto, user);
    }

    @Get()
    findAll(@GetUser() user: User) {
        return this.expensesService.findAll(user);
    }

    @Get(':id')
    findOne(@Param('id', ParseUUIDPipe) id: string, @GetUser() user: User) {
        return this.expensesService.findOne(id, user);
    }

    @Patch(':id')
    update(
        @Param('id', ParseUUIDPipe) id: string,
        @Body() updateExpenseDto: UpdateExpenseDto,
        @GetUser() user: User,
    ) {
        return this.expensesService.update(id, updateExpenseDto, user);
    }

    @Delete(':id')
    remove(@Param('id', ParseUUIDPipe) id: string, @GetUser() user: User) {
        return this.expensesService.remove(id, user);
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
        @Param('id', ParseUUIDPipe) id: string,
        @UploadedFile() file: Express.Multer.File,
        @GetUser() user: User,
    ) {
        return this.expensesService.uploadReceiptFile(id, file, user);
    }

    @Delete(':id/receipt')
    @ApiOperation({ summary: 'Eliminar el comprobante (imagen)' })
    removeReceipt(@Param('id', ParseUUIDPipe) id: string, @GetUser() user: User) {
        return this.expensesService.removeReceipt(id, user);
    }

    @Get(':id/receipt/download')
    @ApiOperation({ summary: 'Descargar el comprobante (imagen)' })
    async downloadReceipt(
        @Param('id', ParseUUIDPipe) id: string,
        @Res() res: Response,
        @GetUser() user: User,
    ) {
        return this.expensesService.downloadReceipt(id, res, user);
    }
}
