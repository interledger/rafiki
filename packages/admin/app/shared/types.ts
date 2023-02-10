import type { z } from 'zod'

export type JSONError<T extends z.ZodTypeAny> = {
  errors: z.typeToFlattenedError<z.infer<T>>
}
