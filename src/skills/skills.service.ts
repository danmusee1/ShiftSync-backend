import { ConflictException, Injectable } from '@nestjs/common';
import type { Skill } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateSkillDto } from './dto/create-skill.dto.js';

@Injectable()
export class SkillsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateSkillDto): Promise<Skill> {
    const existing = await this.prisma.skill.findUnique({ where: { name: dto.name } });
    if (existing) {
      throw new ConflictException('A skill with this name already exists');
    }
    return this.prisma.skill.create({ data: dto });
  }

  findAll(): Promise<Skill[]> {
    return this.prisma.skill.findMany({ orderBy: { name: 'asc' } });
  }
}
