import { Injectable, InternalServerErrorException, Logger, NotFoundException, OnModuleInit, UnsupportedMediaTypeException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomUUID } from 'node:crypto';
import { constants, createReadStream } from 'node:fs';
import { mkdir, open, readdir, rename, rm, stat } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { IsNull, Repository } from 'typeorm';
import type { Express } from 'express';
import { ListRecordsDto } from './dto/list-records.dto.js';
import { RecordEntity } from './record.entity.js';

const videoDirectory = () => process.env.VIDEO_STORAGE_DIR ?? join(process.cwd(), 'data', 'videos');
const tombstoneSuffix = '.deleting';
const mimeExtensions: Record<string, string> = {
  'video/mp4': '.mp4', 'video/webm': '.webm', 'video/ogg': '.ogv', 'video/quicktime': '.mov',
};
const allowedVideoExtensions = new Set([...Object.values(mimeExtensions), '.m4v', '.mkv', '.avi']);

@Injectable()
export class RecordsService implements OnModuleInit {
  private readonly logger = new Logger(RecordsService.name);

  constructor(@InjectRepository(RecordEntity) private readonly repository: Repository<RecordEntity>) {}

  async onModuleInit(): Promise<void> {
    await this.reconcileTombstones();
  }

  async list(query: ListRecordsDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const builder = this.repository.createQueryBuilder('record');
    builder.where('record.deletedAt IS NULL');
    if (query.search?.trim()) {
      builder.andWhere('record.orderCode ILIKE :search', { search: `%${query.search.trim()}%` });
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

  async create(operatorId: string, orderCode: string, upload: Express.Multer.File, captureId?: string, recordedAt = new Date()) {
    await mkdir(videoDirectory(), { recursive: true });
    const candidateMimeType = (upload.mimetype || '').split(';', 1)[0].trim().toLowerCase();
    if (!/^video\/[a-z0-9.+-]+$/.test(candidateMimeType)) {
      await this.removeFileBestEffort(upload.path);
      throw new UnsupportedMediaTypeException('Uploaded file must have a video MIME type');
    }

    if (captureId) {
      try {
        const existing = await this.repository.findOneBy({ captureId });
        if (existing) {
          await this.removeFileBestEffort(upload.path);
          return this.toSummary(existing);
        }
      } catch (error) {
        await this.removeFileBestEffort(upload.path);
        throw new InternalServerErrorException('Could not check the recording identity', { cause: error });
      }
    }

    const mimeType = candidateMimeType;
    const extension = mimeExtensions[mimeType] ?? this.extensionFor(upload.originalname);
    const filename = `${captureId ? createHash('sha256').update(captureId).digest('hex') : randomUUID()}${extension}`;
    const finalPath = join(videoDirectory(), filename);
    let published = false;

    try {
      // Flush staged data before publishing the final name, then flush its directory entry.
      const staged = await open(upload.path, 'r+');
      try {
        await staged.sync();
      } finally {
        await staged.close();
      }
      await rename(upload.path, finalPath);
      published = true;
      const directoryHandle = await open(videoDirectory(), constants.O_RDONLY);
      try {
        await directoryHandle.sync();
      } finally {
        await directoryHandle.close();
      }
    } catch (error) {
      await this.removeFileBestEffort(upload.path);
      if (published) await this.removeFileBestEffort(finalPath);
      throw new InternalServerErrorException('Could not safely write the video', { cause: error });
    }

    const record = this.repository.create({
      orderCode: orderCode.trim(),
      captureId: captureId ?? null,
      recordedAt,
      filename,
      mimeType,
      operatorId,
    });
    try {
      return this.toSummary(await this.repository.save(record));
    } catch (error) {
      // A connection can fail after PostgreSQL committed. A capture ID lets us resolve that
      // outcome without deleting the only published video file.
      if (captureId) {
        try {
          const existing = await this.repository.findOneBy({ captureId });
          if (existing) {
            if (existing.filename !== filename) await this.removeFileBestEffort(finalPath);
            return this.toSummary(existing);
          }
        } catch (lookupError) {
          throw new InternalServerErrorException('Could not resolve video save outcome; the video was preserved for recovery', { cause: lookupError });
        }
      }
      // Without an idempotency key, preserve the published file instead of risking deleting
      // a file whose metadata commit cannot be observed after a database error.
      throw new InternalServerErrorException('Could not resolve video save outcome; the video was preserved for recovery', { cause: error });
    }
  }

  async getDownload(id: string) {
    const record = await this.repository.findOne({ where: { id, deletedAt: IsNull(), videoPurgedAt: IsNull() } });
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
      let record: RecordEntity | null;
      try {
        record = await this.repository.findOneBy({ id });
      } catch {
        failures.push({ id, reason: 'database_read_failed' });
        continue;
      }
      if (!record) {
        failures.push({ id, reason: 'not_found' });
        continue;
      }
      if (record.deletedAt) {
        failures.push({ id, reason: 'already_deleted' });
        continue;
      }

      try {
        const result = await this.repository.update({ id, deletedAt: IsNull() }, { deletedAt: new Date() });
        if (result.affected === 1) {
          deletedIds.push(id);
        } else {
          failures.push({ id, reason: 'already_deleted' });
        }
      } catch {
        failures.push({ id, reason: 'database_update_failed' });
      }
    }
    return { deletedIds, failures };
  }

  async removeTemporaryUpload(path?: string): Promise<void> {
    if (path) await this.removeFileBestEffort(path);
  }

  private async restoreTombstone(tombstonePath: string, sourcePath: string): Promise<boolean> {
    try {
      await rename(tombstonePath, sourcePath);
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') return false;
      try {
        await stat(sourcePath);
        return true;
      } catch {
        return false;
      }
    }
  }

  private async reconcileTombstones(): Promise<void> {
    await mkdir(videoDirectory(), { recursive: true });
    let entries;
    try {
      entries = await readdir(videoDirectory(), { withFileTypes: true });
    } catch (error) {
      this.logger.error('Could not inspect pending video deletions', error instanceof Error ? error.stack : undefined);
      return;
    }

    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith(tombstoneSuffix)) continue;
      const filename = entry.name.slice(0, -tombstoneSuffix.length);
      const tombstonePath = join(videoDirectory(), entry.name);
      const sourcePath = join(videoDirectory(), filename);
      try {
        const record = await this.repository.findOneBy({ filename });
        if (!record) {
          await this.removeFileBestEffort(tombstonePath);
          continue;
        }
        try {
          await stat(sourcePath);
          // The active file is already present; discard the stale pending-delete copy.
          await this.removeFileBestEffort(tombstonePath);
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
          await rename(tombstonePath, sourcePath);
        }
      } catch (error) {
        // Leave the tombstone untouched when its database outcome cannot be checked.
        this.logger.error(`Could not reconcile pending deletion ${entry.name}`, error instanceof Error ? error.stack : undefined);
      }
    }
  }

  private extensionFor(originalName: string): string {
    const extension = extname(originalName).toLowerCase();
    return allowedVideoExtensions.has(extension) ? extension : '.webm';
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
      // Pending files are reconciled on a later startup when applicable.
    }
  }
}
