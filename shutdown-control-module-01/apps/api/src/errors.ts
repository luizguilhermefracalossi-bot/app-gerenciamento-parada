import { Catch, ArgumentsHost, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';
import { DomainError } from '@shutdown/domain';
import { ZodError } from 'zod';
export class ApiProblem extends Error { constructor(readonly code:string, message:string, readonly status=422, readonly details?:unknown){super(message);} }
@Catch()
export class ErrorFilter implements ExceptionFilter { catch(error: unknown, host: ArgumentsHost) { const res=host.switchToHttp().getResponse(); const req=host.switchToHttp().getRequest<{id?:string}>(); const e=error instanceof ApiProblem?error:error instanceof DomainError?new ApiProblem(error.code,error.message,error.status):error instanceof ZodError?new ApiProblem('VALIDATION_ERROR','Invalid request',400,error.flatten()):error instanceof HttpException?new ApiProblem('HTTP_ERROR',error.message,error.getStatus()):new ApiProblem('INTERNAL_ERROR','Internal server error',500); res.status(e.status).json({code:e.code,message:e.message,requestId:req.id??'unknown',...(e.details===undefined?{}:{details:e.details})}); } }
