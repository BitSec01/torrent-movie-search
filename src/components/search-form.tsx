"use client";

import { useForm } from "@tanstack/react-form";
import { z } from "zod";

const searchSchema = z.object({
  query: z.string().min(1, "Enter at least 1 character"),
  type: z.enum(["", "movie", "series", "episode"]).optional(),
  year: z
    .string()
    .refine(
      (v) => !v || (/^\d{4}$/.test(v) && Number(v) >= 1900 && Number(v) <= 2030),
      "Enter a valid year (1900–2030)"
    )
    .optional(),
});

export type SearchValues = z.infer<typeof searchSchema>;

interface SearchFormProps {
  onSearch: (values: SearchValues) => void;
  isLoading?: boolean;
  initialValues?: Partial<SearchValues>;
}

export function SearchForm({ onSearch, isLoading, initialValues }: SearchFormProps) {
  const form = useForm({
    defaultValues: {
      query: initialValues?.query ?? "",
      type: initialValues?.type ?? ("" as const),
      year: initialValues?.year ?? "",
    },
    onSubmit: ({ value }) => {
      const parsed = searchSchema.safeParse(value);
      if (parsed.success) {
        onSearch(parsed.data);
      }
    },
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        e.stopPropagation();
        form.handleSubmit();
      }}
      className="w-full"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        {/* Search query */}
        <div className="flex-1">
          <form.Field
            name="query"
            validators={{
              onSubmit: ({ value }) => {
                const result = searchSchema.shape.query.safeParse(value);
                return result.success ? undefined : result.error.errors[0].message;
              },
            }}
          >
            {(field) => (
              <div>
                <input
                  type="text"
                  placeholder="Search movies & series..."
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.value)}
                  onBlur={field.handleBlur}
                  className="h-12 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-4 text-base text-white placeholder-zinc-500 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30"
                />
                {field.state.meta.errors.length > 0 && (
                  <p className="mt-1 text-sm text-red-400">
                    {field.state.meta.errors.join(", ")}
                  </p>
                )}
              </div>
            )}
          </form.Field>
        </div>

        {/* Type filter */}
        <div className="w-full sm:w-36">
          <form.Field name="type">
            {(field) => (
              <select
                value={field.state.value}
                onChange={(e) => field.handleChange(e.target.value as "" | "movie" | "series" | "episode")}
                className="h-12 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 text-sm text-white outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30"
              >
                <option value="">All Types</option>
                <option value="movie">Movies</option>
                <option value="series">Series</option>
                <option value="episode">Episodes</option>
              </select>
            )}
          </form.Field>
        </div>

        {/* Year filter */}
        <div className="w-full sm:w-28">
          <form.Field
            name="year"
            validators={{
              onSubmit: ({ value }) => {
                if (!value) return undefined;
                const result = searchSchema.shape.year.safeParse(value);
                return result.success ? undefined : "Invalid year";
              },
            }}
          >
            {(field) => (
              <div>
                <input
                  type="text"
                  placeholder="Year"
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.value)}
                  onBlur={field.handleBlur}
                  className="h-12 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 text-sm text-white placeholder-zinc-500 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30"
                />
                {field.state.meta.errors.length > 0 && (
                  <p className="mt-1 text-sm text-red-400">
                    {field.state.meta.errors.join(", ")}
                  </p>
                )}
              </div>
            )}
          </form.Field>
        </div>

        {/* Submit */}
        <button
          type="submit"
          disabled={isLoading}
          className="h-12 inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg bg-indigo-600 px-6 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-50"
        >
          {isLoading ? (
            <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
          ) : (
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35m0 0A7.5 7.5 0 104.5 4.5a7.5 7.5 0 0012.15 12.15z" />
            </svg>
          )}
          Search
        </button>
      </div>
    </form>
  );
}
