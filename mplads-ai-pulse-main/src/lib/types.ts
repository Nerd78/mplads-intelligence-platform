/**
 * tsconfig has `exactOptionalPropertyTypes: true` -- an optional field
 * (`field?: T`) then rejects an explicit `undefined` assignment, which is
 * exactly what filter/search-param objects do constantly here (e.g. "no
 * state selected" is `state: undefined`, not an omitted key). `Loose<T>`
 * makes every field of T optional AND explicitly `| undefined`, which is
 * what exactOptionalPropertyTypes actually wants for that use case.
 */
export type Loose<T> = { [K in keyof T]?: T[K] | undefined };
