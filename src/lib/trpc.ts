"use client";

import { createTRPCReact } from "@trpc/react-query";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@/server/routers/_app";

export const trpc = createTRPCReact<AppRouter>();

/** Query/mutation return types, inferred from the routers — use instead of `any` in components. */
export type RouterOutputs = inferRouterOutputs<AppRouter>;
