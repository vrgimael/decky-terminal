import { routerHook } from "@decky/api";
import Settings from "../pages/Settings";
import Terminal from "../pages/Terminal.jsx";

export function registerRoutes() {
    routerHook.addRoute('/decky-terminal-focus/terminals/:id', Terminal, {
        exact: true,
    });

    routerHook.addRoute("/decky-terminal-focus/settings", Settings, {
        exact: true,
    });
}

export function unregisterRoutes() {
    routerHook.removeRoute('/decky-terminal-focus/terminals/:id');
    routerHook.removeRoute('/decky-terminal-focus/settings');
}
