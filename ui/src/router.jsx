import React from "react";
import { createRootRoute, createRoute, createRouter, Outlet } from "@tanstack/react-router";
import { AppShell } from "./app/AppShell";

function RootLayout() {
  return <Outlet />;
}

const rootRoute = createRootRoute({
  component: RootLayout
});

const workspaceRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: AppShell
});

const routeTree = rootRoute.addChildren([workspaceRoute]);

export const router = createRouter({
  routeTree,
  defaultPreload: "intent"
});
