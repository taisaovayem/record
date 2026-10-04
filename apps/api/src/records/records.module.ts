import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RecordEntity } from './record.entity.js';
import { RecordsController } from './records.controller.js';
import { RecordsService } from './records.service.js';

@Module({ imports: [TypeOrmModule.forFeature([RecordEntity])], controllers: [RecordsController], providers: [RecordsService] })
export class RecordsModule {}
