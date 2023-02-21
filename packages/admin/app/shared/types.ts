import type { z } from 'zod'

export type JSONError<T extends z.ZodTypeAny> = {
  errors: z.typeToFlattenedError<z.infer<T>>
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Keys<T> = T extends any ? keyof T : never

export type ZodFieldErrors<T extends z.ZodTypeAny> = {
  [P in Keys<z.TypeOf<T>>]?: string[] | undefined
}
