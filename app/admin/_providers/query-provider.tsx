"use client";

/**
 * QueryClientProvider wrapper for the admin tree. Scoped to admin/* so the
 * public wall (server-rendered, ISR-cached) doesn't pay the runtime cost.
 *
 * staleTime/refetchOnWindowFocus tuned for an admin tool: data the operator
 * just edited shouldn't refetch and clobber the optimistic state on tab
 * focus. Mutations explicitly invalidate keys when the server confirms.
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";

export function AdminQueryProvider({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000,
            refetchOnWindowFocus: false,
            retry: 1,
          },
          mutations: {
            retry: 0,
          },
        },
      }),
  );
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
