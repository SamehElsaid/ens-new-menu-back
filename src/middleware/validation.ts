import { Request, Response, NextFunction } from 'express';
import { validationResult, ValidationChain } from 'express-validator';

export function validate(validations: ValidationChain[]) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    // Run all validations
    for (const validation of validations) {
      await validation.run(req);
    }

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const errorMessages = errors.array().map(err => {
        const field = err.type === 'field' ? err.path : 'unknown';
        return `${field}: ${err.msg}`;
      }).join(', ');
      
      res.status(400).json({
        error: `Validation failed: ${errorMessages}`,
        details: errors.array().map(err => ({
          field: err.type === 'field' ? err.path : undefined,
          message: err.msg,
        })),
      });
      return;
    }

    next();
  };
}


