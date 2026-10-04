import {
  BadRequestException, Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Query,
  Res, UploadedFile, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Express, Response } from 'express';
import { BulkDeleteDto } from './dto/bulk-delete.dto.js';
import { ListRecordsDto } from './dto/list-records.dto.js';
import { RecordsService } from './records.service.js';

const videoDirectory = () => process.env.VIDEO_STORAGE_DIR ?? join(process.cwd(), 'data', 'videos');

@Controller('records')
export class RecordsController {
  constructor(private readonly records: RecordsService) {}

  @Get()
  list(@Query() query: ListRecordsDto) {
    return this.records.list(query);
  }

  @Post()
  @UseInterceptors(FileInterceptor('video', {
    storage: diskStorage({
      destination: (_request, _file, callback) => {
        try {
          const directory = videoDirectory();
          mkdirSync(directory, { recursive: true });
          callback(null, directory);
        } catch (error) {
          callback(error as Error, '');
        }
      },
      filename: (_request, _file, callback) => callback(null, `${randomUUID()}.uploading`),
    }),
    // Intentionally no small fileSize limit: use disk-backed staging for long recordings.
  }))
  async upload(@Body('orderCode') orderCode: unknown, @UploadedFile() video: Express.Multer.File | undefined) {
    if (typeof orderCode !== 'string' || !orderCode.trim() || orderCode.length > 255) {
      await this.records.removeTemporaryUpload(video?.path);
      throw new BadRequestException('orderCode must be a non-empty string of at most 255 characters');
    }
    if (!video) throw new BadRequestException('video file is required');
    return this.records.create(orderCode, video);
  }

  @Get(':id/download')
  async download(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string, @Res() response: Response) {
    const file = await this.records.getDownload(id);
    response.setHeader('Content-Type', file.mimeType);
    response.setHeader('Content-Length', file.size);
    response.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`);
    file.stream.on('error', (error) => response.destroy(error));
    file.stream.pipe(response);
  }

  @Delete('bulk')
  removeMany(@Body() body: BulkDeleteDto) {
    return this.records.removeMany(body.ids);
  }
}
