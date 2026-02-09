import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';
import { logger } from '../utils/logger';

/**
 * Middleware to validate request body/query against a Zod schema
 * @param schema - Zod schema to validate against
 * @param source - Where to get the data from ('body' or 'query')
 */
export const validateRequest = (
  schema: ZodSchema,
  source: 'body' | 'query' = 'body'
) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const dataToValidate = source === 'body' ? req.body : req.query;
      
      // Parse and validate the data
      const validated = await schema.parseAsync(dataToValidate);
      
      // Replace request data with validated data
      if (source === 'body') {
        req.body = validated;
      } else {
        req.query = validated as any;
      }
      
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        // Format Zod errors into a readable format
        const errors = error.issues?.map((err: any) => ({
          field: err.path.join('.'),
          message: err.message,
        })) || [];
        
        logger.warn('Validation error:', { errors });
        
        return res.status(400).json({
          error: 'Validation failed',
          details: errors,
          message: errors[0]?.message || 'Invalid input data',
        });
      }
      
      // Handle unexpected errors
      logger.error('Unexpected validation error:', error);
      return res.status(500).json({
        error: 'Internal server error during validation',
      });
    }
  };
};

