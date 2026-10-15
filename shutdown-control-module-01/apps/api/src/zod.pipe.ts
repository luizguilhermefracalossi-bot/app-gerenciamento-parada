import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common'; import type { ZodType } from 'zod';
@Injectable() export class ZodPipe implements PipeTransform { constructor(private readonly schema:ZodType){} transform(value:unknown){const parsed=this.schema.safeParse(value);if(!parsed.success)throw new BadRequestException(parsed.error.flatten());return parsed.data;} }
