import { Injectable, InternalServerErrorException, NotFoundException, UnsupportedMediaTypeException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { createReadStream } from 'node:fs';
import { mkdir, open, rename, rm, stat, unlink } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { Repository } from 'typeorm';
import type { Express } from 'express';
import { ListRecordsDto } from './dto/list-records.dto.js';
import { RecordEntity } from './record.entity.js';

const videoDirectory = () => process.env.VIDEO_STORAGE_DIR ?? join(process.cwd(), 'data', 'videos');
const mimeExtensions: Record<string, string> = {
  'video/mp4': '.mp4', 'video/webm': '.webm', 'video/ogg': '.ogv', 'video/quicktime': '.mov',
};

@Injectable()
export class RecordsService {
  constructor(@InjectRepository(RecordEntity) private readonly repository: Repository<RecordEntity>) {}

  async list(query: ListRecordsDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const builder = this.repository.createQueryBuilder('record');
    if (query.search?.trim()) {
      builder.where('record.orderCode ILIKE :search', { search: `%${query.search.trim()}%` });
    }
    const [records, total] = await builder
      .orderBy('record.recordedAt', 'DESC')
      .addOrderBy('record.id', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();
    return {
      items: records.map((record) => this.toSummary(record)),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async create(orderCode: string, upload: Express.Multer.File) {
    await mkdir(videoDirectory(), { recursive: true });
    const candidateMimeType = (upload.mimetype || '').split(';', 1)[0].trim().toLowerCase();
    if (!/^video\/[a-z0-9.+-]+$/.test(candidateMimeType)) {
      await this.removeFileBestEffort(upload.path);
      throw new UnsupportedMediaTypeException('Uploaded file must have a video MIME type');
    }
    const mimeType = candidateMimeType;
    const extension = mimeExtensions[mimeType] ?? this.extensionFor(upload.originalname);
    const filename = `${randomUUID()}${extension}`;
    const finalPath = join(videoDirectory(), filename);

    try {
      // Flush staged file contents, atomically publish the final name, then flush the directory entry.
      const staged = await open(upload.path, 'r+');
      try {
        await staged.sync();
      } finally {
        await staged.close();
      }
      await rename(upload.path, finalPath);
      const directoryHandle = await open(videoDirectory(), constants.O_RDONLY);
      try {
        await directoryHandle.sync();
      } finally {
        await directoryHandle.close();
      }

      const record = this.repository.create({ orderCode: orderCode.trim(), filename, mimeType });
      return this.toSummary(await this.repository.save(record));
    } catch (error) {
      await this.removeFileBestEffort(upload.path);
      // After rename, the staged path no longer exists. Remove the published path too
      // if directory syncing or metadata persistence fails, so no unindexed video is orphaned.
      await this.removeFileBestEffort(finalPath);
      throw new InternalServerErrorException('Could not safely save the video', { cause: error });
    }
  }

  async getDownload(id: string) {
    const record = await this.repository.findOneBy({ id });
    if (!record) throw new NotFoundException('Record not found');
    const path = join(videoDirectory(), record.filename);
    try {
      const fileStat = await stat(path);
      return { filename: record.filename, mimeType: record.mimeType, size: fileStat.size, stream: createReadStream(path) };
    } catch {
      throw new NotFoundException('Video file not found');
    }
  }

  async removeMany(ids: string[]) {
    const deletedIds: string[] = [];
    const failures: { id: string; reason: string }[] = [];
    for (const id of [...new Set(ids)]) {
      try {
        const record = await this.repository.findOneBy({ id });
        if (!record) {
          failures.push({ id, reason: 'not_found' });
          continue;
        }
        try {
          await unlink(join(videoDirectory(), record.filename));
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
            failures.push({ id, reason: 'video_file_delete_failed' });
            continue;
          }
          // A missing file should not prevent cleanup of the metadata row.
        }
        try {
          await this.repository.delete({ id });
          deletedIds.push(id);
        } catch {
          // Leave the row so this item can be retried; its already-removed file is treated as missing next time.
          failures.push({ id, reason: 'database_delete_failed' });
        }
      } catch {
        failures.push({ id, reason: 'database_read_failed' });
      }
    }
    return { deletedIds, failures };
  }

  async removeTemporaryUpload(path?: string): Promise<void> {
    if (path) await this.removeFileBestEffort(path);
  }

  private extensionFor(originalName: string): string {
    const extension = extname(originalName).toLowerCase();
    return /^\.[a-z0-9]{1,8}$/.test(extension) ? extension : '.bin';
  }

  private toSummary(record: RecordEntity) {
    return {
      id: record.id,
      orderCode: record.orderCode,
      recordedAt: record.recordedAt.toISOString(),
      mimeType: record.mimeType,
      originalName: record.filename,
    };
  }

  private async removeFileBestEffort(path: string): Promise<void> {
    try {
      await rm(path, { force: true });
    } catch {
      // Keep the primary error; stale staging files do not become visible records.
    }
  }
}
